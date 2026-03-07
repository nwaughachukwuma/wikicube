import { generateOverview, generateEmbeddings } from "../genai";
import { updateWikiStatus, insertChunks, markSearchReady } from "../db";
import { chunkCodeFile, chunkWikiContent, chunkOverview } from "../chunker";
import { logger } from "../logger";
import type { AnalysisEvent, Feature } from "../types";

const log = logger("embedder");

/**
 * Phase E: Generate the repository overview page and persist it.
 * Returns the overview text so the caller can mark the wiki as "done"
 * before kicking off the non-blocking embedding phase.
 */
export async function generateOverviewPage(params: {
  wikiId: string;
  owner: string;
  repo: string;
  description: string;
  readme: string;
  features: Feature[];
  onEvent: (event: AnalysisEvent) => void;
}): Promise<string> {
  const { wikiId, owner, repo, description, readme, features, onEvent } =
    params;

  onEvent({
    type: "status",
    status: "generating_pages",
    message: "Generating overview page...",
  });

  const overviewDone = log.time("generateOverview");
  const overview = await generateOverview(
    `${owner}/${repo}`,
    description,
    readme,
    features.map((f) => ({ title: f.title, summary: f.summary })),
  );

  await updateWikiStatus(wikiId, "embedding", overview);
  overviewDone({ overviewLength: overview.length });

  return overview;
}

/**
 * Phase F: Chunk wiki pages and source files, generate embeddings, and
 * persist all chunk records for semantic search.
 * Designed to run as a fire-and-forget background task after the wiki
 * is already marked "done" so users can start reading immediately.
 */
export async function embedWikiAndCode(params: {
  wikiId: string;
  features: Feature[];
  sourceFiles: Map<string, string>;
  overview: string;
  onEvent: (event: AnalysisEvent) => void;
}): Promise<void> {
  const { wikiId, features, sourceFiles, overview, onEvent } = params;
  log.info("starting embedding phase", { wikiId });

  onEvent({
    type: "status",
    status: "embedding",
    message: "Creating search index...",
  });

  const chunkMeta: Array<{
    feature_id: string | null;
    source_type: "wiki" | "code";
    source_file: string | null;
  }> = [];

  // 1. Chunk overview at section boundaries
  const allChunkTexts: string[] = [];
  for (const text of chunkOverview(overview)) {
    allChunkTexts.push(text);
    chunkMeta.push({
      source_type: "wiki",
      feature_id: null,
      source_file: null,
    });
  }

  // 2. Chunk each feature's wiki content at feature/section level
  for (const feature of features) {
    for (const wc of chunkWikiContent(
      feature.title,
      feature.summary,
      feature.markdown_content,
    )) {
      allChunkTexts.push(wc.content);
      chunkMeta.push({
        source_type: "wiki",
        feature_id: feature.id,
        source_file: null,
      });
    }
  }

  // 3. Chunk source code at function/class/module boundaries.
  // Each chunk includes file path + import context for call-graph awareness.
  for (const [filePath, content] of sourceFiles) {
    for (const cc of chunkCodeFile(filePath, content)) {
      allChunkTexts.push(cc.content);
      chunkMeta.push({
        source_type: "code",
        feature_id: null,
        source_file: cc.filePath,
      });
    }
  }

  log.info("chunking complete", {
    totalChunks: allChunkTexts.length,
    wikiChunks: chunkMeta.filter((c) => c.source_type === "wiki").length,
    codeChunks: chunkMeta.filter((c) => c.source_type === "code").length,
    sourceFiles: sourceFiles.size,
  });

  onEvent({
    type: "status",
    status: "embedding",
    message: `Embedding ${allChunkTexts.length} chunks (${sourceFiles.size} file references + wiki)...`,
  });

  if (allChunkTexts.length === 0) {
    await markSearchReady(wikiId);
    log.warn("No chunks generated; marking search ready without embeddings", {
      wikiId,
    });
    return;
  }

  const embedDone = log.time("generateEmbeddings");
  const embeddings = await generateEmbeddings(allChunkTexts); //.slice(0, 100));
  embedDone({
    chunks: allChunkTexts.length,
    embeddings: embeddings.length,
  });

  //.slice(0, 100)
  const chunkRecords = allChunkTexts.map((text, i) => ({
    wiki_id: wikiId,
    feature_id: chunkMeta[i].feature_id,
    content: text,
    source_type: chunkMeta[i].source_type,
    source_file: chunkMeta[i].source_file,
    embedding: embeddings[i],
  }));

  const insertDone = log.time("insertChunks");
  await insertChunks(chunkRecords);
  insertDone({ records: chunkRecords.length });

  await markSearchReady(wikiId);
}
