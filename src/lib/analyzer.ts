import {
  getRepoMeta,
  getRepoTree,
  filterTree,
  formatTreeString,
  fetchProjectContext,
  getMultipleFiles,
} from "./github";
import {
  identifyFeatures,
  generateFeaturePage,
  generateOverview,
  generateEmbeddings,
} from "./openai";
import {
  upsertWiki,
  updateWikiStatus,
  insertFeature,
  insertChunks,
} from "./db";
import { chunkCodeFile, chunkWikiContent, chunkOverview } from "./chunker";
import type { AnalysisEvent, Feature } from "./types";

/** Run the full analysis pipeline with SSE progress reporting */
export async function runAnalysisPipeline(
  owner: string,
  repo: string,
  onEvent: (event: AnalysisEvent) => void,
): Promise<string> {
  try {
    // Phase A: Context gathering
    onEvent({
      type: "status",
      status: "fetching_tree",
      message: "Fetching repository metadata...",
    });

    const meta = await getRepoMeta(owner, repo);
    const wiki = await upsertWiki(owner, repo, meta.defaultBranch);
    const wikiId = wiki.id;

    onEvent({
      type: "status",
      status: "fetching_tree",
      message: "Fetching file tree...",
    });
    const rawTree = await getRepoTree(owner, repo, meta.defaultBranch);
    const tree = filterTree(rawTree);
    const treeString = formatTreeString(tree);
    const treePaths = tree.map((e) => e.path);

    onEvent({
      type: "status",
      status: "fetching_tree",
      message: "Fetching README and manifests...",
    });
    const { readme, manifests } = await fetchProjectContext(
      owner,
      repo,
      meta.defaultBranch,
      treePaths,
    );

    await updateWikiStatus(wikiId, "identifying_features");

    // Phase B: Feature identification
    onEvent({
      type: "status",
      status: "identifying_features",
      message: "Identifying user-facing features...",
    });
    const identifiedFeatures = await identifyFeatures(
      `${owner}/${repo}`,
      treeString,
      readme,
      manifests,
      meta.description,
    );

    if (!identifiedFeatures.length) {
      throw new Error("No features identified in repository");
    }

    onEvent({
      type: "status",
      status: "generating_pages",
      message: `Found ${identifiedFeatures.length} features. Generating wiki pages...`,
    });
    await updateWikiStatus(wikiId, "generating_pages");

    // Phase C + D: Fetch files & generate pages (with concurrency limit)
    // We also collect all fetched source files for code-chunk embedding later.
    const features: Feature[] = [];
    const allSourceFiles = new Map<string, string>();
    const concurrency = 3;
    const queue = [...identifiedFeatures];
    let sortOrder = 0;

    async function processFeature() {
      while (queue.length > 0) {
        const identified = queue.shift()!;
        const order = sortOrder++;

        onEvent({ type: "feature_started", featureTitle: identified.title });

        try {
          // Fetch relevant files (cap at 30)
          const filesToFetch = identified.relevantFiles.slice(0, 30);
          const fileContents = await getMultipleFiles(
            owner,
            repo,
            meta.defaultBranch,
            filesToFetch,
          );

          // Save raw files for code embedding
          for (const [path, content] of fileContents) {
            allSourceFiles.set(path, content);
          }

          // Generate wiki page
          const page = await generateFeaturePage(
            `${owner}/${repo}`,
            owner,
            repo,
            meta.defaultBranch,
            identified,
            fileContents,
          );

          // Save to DB
          const slug =
            identified.id ||
            identified.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
          const feature = await insertFeature({
            wiki_id: wikiId,
            slug,
            title: identified.title,
            summary: identified.summary,
            markdown_content: page.markdownContent,
            entry_points: page.entryPoints,
            citations: page.citations,
            sort_order: order,
          });
          features.push(feature);

          onEvent({ type: "feature_done", featureTitle: identified.title });
        } catch (err) {
          console.error(`Error generating page for ${identified.title}:`, err);
          // Still continue with other features
          onEvent({
            type: "feature_done",
            featureTitle: `${identified.title} (partial)`,
          });
        }
      }
    }

    // Run with concurrency
    const workers = Array.from(
      { length: Math.min(concurrency, identifiedFeatures.length) },
      processFeature,
    );
    await Promise.all(workers);

    // Phase E: Generate overview
    onEvent({
      type: "status",
      status: "generating_pages",
      message: "Generating overview page...",
    });
    const overview = await generateOverview(
      `${owner}/${repo}`,
      meta.description,
      readme,
      features.map((f) => ({ title: f.title, summary: f.summary })),
    );
    await updateWikiStatus(wikiId, "embedding", overview);

    // Phase F: Embedding — contextual chunking for wiki + code
    onEvent({
      type: "status",
      status: "embedding",
      message: "Creating search index...",
    });

    const allChunkTexts: string[] = [];
    const chunkMeta: Array<{
      feature_id: string | null;
      source_type: "wiki" | "code";
      source_file: string | null;
    }> = [];

    // 1. Chunk overview at section boundaries
    for (const text of chunkOverview(overview)) {
      allChunkTexts.push(text);
      chunkMeta.push({
        feature_id: null,
        source_type: "wiki",
        source_file: null,
      });
    }

    // 2. Chunk each feature's wiki content at feature/section level
    for (const feature of features) {
      const wikiChunks = chunkWikiContent(
        feature.title,
        feature.summary,
        feature.markdown_content,
      );
      for (const wc of wikiChunks) {
        allChunkTexts.push(wc.content);
        chunkMeta.push({
          feature_id: feature.id,
          source_type: "wiki",
          source_file: null,
        });
      }
    }

    // 3. Chunk source code at function/class/module boundaries
    //    Each chunk includes file path + import context for call-graph awareness
    for (const [filePath, content] of allSourceFiles) {
      const codeChunks = chunkCodeFile(filePath, content);
      for (const cc of codeChunks) {
        allChunkTexts.push(cc.content);
        chunkMeta.push({
          feature_id: null, // code chunks aren't feature-scoped
          source_type: "code",
          source_file: cc.filePath,
        });
      }
    }

    onEvent({
      type: "status",
      status: "embedding",
      message: `Embedding ${allChunkTexts.length} chunks (${allSourceFiles.size} source files + wiki)...`,
    });

    // Generate embeddings
    if (allChunkTexts.length > 0) {
      const embeddings = await generateEmbeddings(allChunkTexts);

      // Build chunk records
      const chunkRecords = allChunkTexts.map((text, i) => ({
        wiki_id: wikiId,
        feature_id: chunkMeta[i].feature_id,
        content: text,
        source_type: chunkMeta[i].source_type,
        source_file: chunkMeta[i].source_file,
        embedding: embeddings[i],
      }));

      await insertChunks(chunkRecords);
    }

    // Done
    await updateWikiStatus(wikiId, "done");
    onEvent({ type: "done", wikiId });
    return wikiId;
  } catch (err) {
    console.error("Analysis pipeline error:", err);
    onEvent({
      type: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    });
    throw err;
  }
}
