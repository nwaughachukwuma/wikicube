import { generateOverview, generateEmbeddings } from "../openai";
import { updateWikiStatus, insertChunks } from "../db";
import { chunkCodeFile, chunkWikiContent, chunkOverview } from "../chunker";
import { logger } from "../logger";
import type { AnalysisEvent, Feature } from "../types";

const log = logger("embedder");

/**
 * Phase E: Generate the repository overview page, then persist it and
 * kick off Phase F (chunking + embedding) in one call.
 */
export async function generateOverviewAndEmbed(params: {
  wikiId: string;
  owner: string;
  repo: string;
  description: string;
  readme: string;
  features: Feature[];
  sourceFiles: Map<string, string>;
  onEvent: (event: AnalysisEvent) => void;
}): Promise<void> {
  const {
    wikiId,
    owner,
    repo,
    description,
    readme,
    features,
    sourceFiles,
    onEvent,
  } = params;

  // Phase E: overview
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

  // Phase F: chunk + embed
  await embedWikiAndCode({
    wikiId,
    features,
    sourceFiles,
    overview,
    onEvent,
  });
}

/**
 * Phase F: Chunk wiki pages and source files, generate embeddings, and
 * persist all chunk records for semantic search.
 *
 * TODO: rewrite this function to ensure order consistency all across
 */
async function embedWikiAndCode(params: {
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

  if (allChunkTexts.length === 0) return;

  // Generate embeddings (current cap: first 100 chunks)
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
}
