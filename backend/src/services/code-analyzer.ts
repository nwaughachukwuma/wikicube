import GithubSlugger from "github-slugger";
import { encoding_for_model } from "tiktoken";
import { logger } from "@shared/logger.js";
import { batchAll } from "@shared/batch-ops.js";
import { ensureError } from "@shared/error.js";
import type {
  AnalysisEvent,
  Feature,
  IdentifiedFeature,
  PipelineOptions,
  RepoMeta,
} from "@shared/types.js";
import {
  getRepoMeta,
  getRepoTree,
  filterTree,
  formatTreeString,
  fetchProjectContext,
  getMultipleFiles,
} from "@shared/github.js";
import {
  identifyFeatures,
  generateFeaturePage,
  generateOverview,
} from "@shared/genai/index.js";
import {
  upsertWiki,
  updateWikiStatus,
  insertFeature,
  insertChunks,
  markSearchReady,
  markSearchFailed,
} from "./db.js";
import { generateEmbeddings } from "@shared/embeddings.js";

const log = logger("repo:analyzer");

/* ─── Analyzer ─── */

export async function runAnalysisPipeline(
  owner: string,
  repo: string,
  onEvent: (event: AnalysisEvent) => void,
  opts: PipelineOptions = {},
): Promise<string> {
  log.info("pipeline started", { owner, repo });
  const pipelineDone = log.time("pipeline");
  try {
    const contextResult = await gatherContext(owner, repo, onEvent, opts);
    const { meta, wikiId, treeString, treePaths, readme, manifests } =
      contextResult;

    const identifiedFeatures = await identifyRepoFeatures({
      owner,
      repo,
      wikiId,
      treeString,
      readme,
      manifests,
      meta,
      onEvent,
      treePaths,
    });

    await updateWikiStatus(wikiId, "generating_pages");
    const { features, sourceFiles } = await generateAllPages(
      identifiedFeatures,
      owner,
      repo,
      meta,
      wikiId,
      onEvent,
      opts.githubToken,
    );

    const overview = await generateOverviewPage({
      wikiId,
      owner,
      repo,
      description: meta.description,
      readme,
      features,
      onEvent,
    });

    await updateWikiStatus(wikiId, "done");
    pipelineDone({ wikiId, featureCount: features.length });
    onEvent({ type: "done", wikiId });

    void embedWikiAndCode({
      wikiId,
      features,
      sourceFiles,
      overview,
      onEvent,
    }).catch(async (err) => {
      const normalizedError = ensureError(err, "Background embedding failed");
      log.error("Background embedding failed", {
        wikiId,
        error: normalizedError.message,
        stack: normalizedError.stack,
      });
      onEvent({
        type: "status",
        status: "error",
        message: "Background embedding failed.",
      });
      await markSearchFailed(wikiId, normalizedError.message);
    });

    return wikiId;
  } catch (err) {
    const normalizedError = ensureError(err, "Pipeline failed");
    log.error("pipeline failed", {
      owner,
      repo,
      error: normalizedError.message,
      stack: normalizedError.stack,
    });
    onEvent({
      type: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    });
    throw err;
  }
}

/* ─── Context Gatherer ─── */

const logCtx = logger("repo:gather-context");

export interface GatheredContext {
  meta: RepoMeta;
  wikiId: string;
  treeString: string;
  treePaths: string[];
  readme: string;
  manifests: string;
}

export async function gatherContext(
  owner: string,
  repo: string,
  onEvent: (event: AnalysisEvent) => void,
  opts: PipelineOptions = {},
): Promise<GatheredContext> {
  onEvent({
    type: "status",
    status: "fetching_tree",
    message: "Fetching repository metadata...",
  });

  const metaDone = logCtx.time("getRepoMeta");
  const meta = await getRepoMeta(owner, repo, opts.githubToken);
  metaDone({ defaultBranch: meta.defaultBranch });

  onEvent({
    type: "status",
    status: "fetching_tree",
    message: "Fetching file tree...",
  });

  const upsertAndTreeDone = logCtx.time("upsertWiki:+:getRepoTree");
  const [wiki, rawTree] = await Promise.all([
    upsertWiki(owner, repo, meta.defaultBranch, {
      visibility: meta.isPrivate ? "private" : "public",
      indexedBy: opts.userId || undefined,
    }),
    getRepoTree(owner, repo, meta.defaultBranch, opts.githubToken),
  ]);

  upsertAndTreeDone({ wikiId: wiki.id, rawTreeSize: rawTree.length });

  const wikiId = wiki.id;
  const tree = filterTree(rawTree);
  logCtx.info("tree filtered", {
    wikiId,
    rawFiles: rawTree.length,
    filteredFiles: tree.length,
  });
  onEvent({
    type: "status",
    status: "fetching_tree",
    message: "Fetching README and manifests...",
  });

  const fetchCtxDone = logCtx.time("fetchProjectContext");
  const treePaths = tree.map((e) => e.path);
  const { readme, manifests } = await fetchProjectContext(
    owner,
    repo,
    meta.defaultBranch,
    treePaths,
    opts.githubToken,
  );
  fetchCtxDone({
    readmeLength: readme.length,
    manifestLength: manifests.length,
  });

  return {
    meta,
    wikiId,
    treeString: formatTreeString(tree),
    treePaths,
    readme,
    manifests,
  };
}

/* ─── Feature Identifier ─── */

const logFeatId = logger("feature-identifier");

function validateFilePaths(
  features: IdentifiedFeature[],
  treePaths: string[],
): IdentifiedFeature[] {
  const treeSet = new Set(treePaths);
  const basenameMap = new Map<string, string[]>();
  for (const p of treePaths) {
    const base = p.split("/").pop() ?? p;
    if (!basenameMap.has(base)) basenameMap.set(base, []);
    basenameMap.get(base)!.push(p);
  }

  return features.map((feature) => {
    const validated: string[] = [];
    for (const file of feature.relevantFiles) {
      if (treeSet.has(file)) {
        validated.push(file);
      } else {
        const base = file.split("/").pop() ?? file;
        const candidates = basenameMap.get(base);
        if (candidates?.length === 1) {
          validated.push(candidates[0]);
          logFeatId.warn("file path corrected", {
            feature: feature.title,
            from: file,
            to: candidates[0],
          });
        } else {
          logFeatId.warn("file path dropped (not in tree)", {
            feature: feature.title,
            path: file,
          });
        }
      }
    }
    return { ...feature, relevantFiles: validated };
  });
}

export async function identifyRepoFeatures(params: {
  owner: string;
  repo: string;
  wikiId: string;
  treeString: string;
  readme: string;
  manifests: string;
  meta: RepoMeta;
  onEvent: (event: AnalysisEvent) => void;
  treePaths: string[];
}): Promise<IdentifiedFeature[]> {
  const {
    wikiId,
    repo,
    owner,
    treeString,
    treePaths = [],
    onEvent,
    manifests,
    readme,
    meta,
  } = params;

  await updateWikiStatus(wikiId, "identifying_features");
  onEvent({
    type: "status",
    status: "identifying_features",
    message: "Identifying user-facing features...",
  });

  const featuresDone = logFeatId.time("identifyFeatures");
  const identifiedFeatures = await identifyFeatures(
    `${owner}/${repo}`,
    treeString,
    readme,
    manifests,
    meta.description,
  );
  featuresDone({ identifiedFeatures });

  if (!identifiedFeatures.length)
    throw new Error("No features identified in repository");

  const validated =
    treePaths.length > 0
      ? validateFilePaths(identifiedFeatures, treePaths)
      : identifiedFeatures;

  onEvent({ type: "features_list", features: validated.map((f) => f.title) });
  onEvent({
    type: "status",
    status: "generating_pages",
    message: `Found ${identifiedFeatures.length} features, processing top ${validated.length}. Generating wiki pages...`,
  });

  return validated;
}

/* ─── Page Generator ─── */

const logPage = logger("page-generator");
const slugger = new GithubSlugger();

export interface PageGenResult {
  feature: Feature;
  sourceFiles: Map<string, string>;
}

export async function generateAllPages(
  identifiedFeatures: IdentifiedFeature[],
  owner: string,
  repo: string,
  meta: RepoMeta,
  wikiId: string,
  onEvent: (event: AnalysisEvent) => void,
  githubToken?: string,
): Promise<{ features: Feature[]; sourceFiles: Map<string, string> }> {
  const pageGenDone = logPage.time("generateAllPages");

  const results = await batchAll(
    identifiedFeatures,
    async (identified, order) =>
      fetchFilesAndGeneratePage({
        identified,
        order,
        owner,
        repo,
        meta,
        wikiId,
        onEvent,
        githubToken,
      }),
    5,
  ).then((res) => res.filter((r) => r !== null) as PageGenResult[]);

  const features = results.map((r) => r.feature);
  const sourceFiles = results
    .map((r) => r.sourceFiles)
    .reduce((acc, sfiles) => {
      for (const [path, content] of sfiles) acc.set(path, content);
      return acc;
    }, new Map<string, string>());

  pageGenDone({
    featuresCount: features.length,
    totalIdentified: identifiedFeatures.length,
    sourceFiles: sourceFiles.size,
  });
  return { features, sourceFiles };
}

async function fetchFilesAndGeneratePage(params: {
  identified: IdentifiedFeature;
  order: number;
  owner: string;
  repo: string;
  meta: RepoMeta;
  wikiId: string;
  onEvent: (event: AnalysisEvent) => void;
  githubToken?: string;
}): Promise<PageGenResult | null> {
  const { order, owner, repo, meta, wikiId, onEvent, identified, githubToken } =
    params;
  const sourceFiles = new Map<string, string>();
  onEvent({ type: "feature_started", featureTitle: identified.title });

  try {
    const fetchDone = logPage.time(`fetchFiles:${identified.title}`);
    const fileContents = await getMultipleFiles(
      owner,
      repo,
      meta.defaultBranch,
      identified.relevantFiles,
      githubToken,
    );
    fetchDone({
      filesToFetch: identified.relevantFiles.length,
      fileContents: fileContents.size,
    });

    for (const [path, content] of fileContents) sourceFiles.set(path, content);

    const genDone = logPage.time(`generatePage:${identified.title}`);
    const page = await generateFeaturePage(
      `${owner}/${repo}`,
      owner,
      repo,
      meta.defaultBranch,
      identified,
      fileContents,
    );
    genDone({ entryPoints: page.entryPoints, citations: page.citations });

    const slug = identified.id || slugger.slug(identified.title);
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

    onEvent({ type: "feature_done", featureTitle: identified.title });
    return { feature, sourceFiles };
  } catch (err) {
    logPage.error(`feature generation failed: ${identified.title}`, {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    onEvent({
      type: "feature_done",
      featureTitle: `${identified.title} (partial)`,
    });
    return null;
  }
}

/* ─── Embedder ─── */

const logEmbedder = logger("embedder");

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

  const overviewDone = logEmbedder.time("generateOverview");
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

export async function embedWikiAndCode(params: {
  wikiId: string;
  features: Feature[];
  sourceFiles: Map<string, string>;
  overview: string;
  onEvent: (event: AnalysisEvent) => void;
}): Promise<void> {
  const { wikiId, features, sourceFiles, overview, onEvent } = params;
  logEmbedder.info("starting embedding phase", { wikiId });
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

  const allChunkTexts: string[] = [];
  for (const text of chunkOverview(overview)) {
    allChunkTexts.push(text);
    chunkMeta.push({
      source_type: "wiki",
      feature_id: null,
      source_file: null,
    });
  }

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

  logEmbedder.info("chunking complete", {
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
    logEmbedder.warn(
      "No chunks generated; marking search ready without embeddings",
      { wikiId },
    );
    return;
  }

  const embedDone = logEmbedder.time("generateEmbeddings");
  const embeddings = await generateEmbeddings(allChunkTexts);
  embedDone({ chunks: allChunkTexts.length, embeddings: embeddings.length });

  const chunkRecords = allChunkTexts.map((text, i) => ({
    wiki_id: wikiId,
    feature_id: chunkMeta[i].feature_id,
    content: text,
    source_type: chunkMeta[i].source_type,
    source_file: chunkMeta[i].source_file,
    embedding: embeddings[i],
  }));

  const insertDone = logEmbedder.time("insertChunks");
  await insertChunks(chunkRecords);
  insertDone({ records: chunkRecords.length });

  await markSearchReady(wikiId);
}

/* ─── Chunker ─── */

const MAX_CHUNK_TOKENS = 1024;
const encoder = encoding_for_model("gpt-4o-mini");

const FORBIDDEN_TOKENS = [
  "<|endoftext|>",
  "\u0060",
  "<|endofprompt|>",
  "<|fim_prefix|>",
  "<|fim_middle|>",
  "<|fim_suffix|>",
  "\u0060\u0060",
  "\u0060\u0060\u0060",
  "\u0060\u0060\u0060\u0060",
  "<|discriminator|>",
  "<|startoftext|>",
];

function sanitizeText(text: string): string {
  let result = text;
  for (const token of FORBIDDEN_TOKENS) {
    result = result.split(token).join("");
  }
  return result.replace(/[^\x20-\x7E\n\r\t]/g, "");
}

function safeEncode(text: string): Uint32Array {
  try {
    return encoder.encode(sanitizeText(text));
  } catch {
    return encoder.encode(sanitizeText(text));
  }
}

const countTokens = (text: string) => safeEncode(text).length;

function splitByTokenLimit(text: string, limit = MAX_CHUNK_TOKENS): string[] {
  const tokens = safeEncode(text);
  if (tokens.length <= limit) return [text];
  const pieces: string[] = [];
  for (let i = 0; i < tokens.length; i += limit) {
    const slice = tokens.slice(i, i + limit);
    pieces.push(new TextDecoder().decode(encoder.decode(slice)));
  }
  return pieces;
}

const BOUNDARY_PATTERNS = [
  /^(export\s+)?(default\s+)?(async\s+)?function\s+\w+/,
  /^(export\s+)?(default\s+)?class\s+\w+/,
  /^(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\(/,
  /^(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?function/,
  /^(export\s+)?interface\s+\w+/,
  /^(export\s+)?type\s+\w+/,
  /^(export\s+)?enum\s+\w+/,
  /^(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\w+\s*=>/,
  /^(export\s+)?function\s+[A-Z]\w+/,
  /^@\w+/,
  /^(async\s+)?def\s+\w+/,
  /^class\s+\w+/,
  /^(pub\s+)?(async\s+)?fn\s+\w+/,
  /^(pub\s+)?struct\s+\w+/,
  /^(pub\s+)?enum\s+\w+/,
  /^(pub\s+)?trait\s+\w+/,
  /^impl\s+/,
  /^(pub\s+)?mod\s+\w+/,
  /^func\s+(\(\w+\s+\*?\w+\)\s+)?\w+/,
  /^type\s+\w+\s+(struct|interface)/,
  /^(def|class|module)\s+\w+/,
  /^(public|private|protected|internal)?\s*(static\s+)?(class|interface|enum|record|fun|suspend\s+fun)\s+\w+/,
  /^(public|private|internal)?\s*(class|struct|enum|protocol|actor)\s+\w+/,
  /^(public|private|internal)?\s*func\s+\w+/,
  /^\w[\w\s:*&<>]*\s+\w+\s*\([^;]*\)\s*\{/,
  /^class\s+\w+/,
  /^struct\s+\w+/,
  /^template\s*</,
  /^(abstract\s+|final\s+)?class\s+\w+/,
  /^function\s+\w+\s*\(/,
  /^defmodule\s+\w+/,
  /^\s*def\s+\w+/,
  /^\s*defp\s+\w+/,
  /^(class|mixin|extension)\s+\w+/,
  /^\w+\s+\w+\s*\([^)]*\)\s*\{/,
  /^(public|private|protected|internal)?\s*(static\s+)?(class|interface|enum|record|struct)\s+\w+/,
  /^(public|private|protected|internal)?\s*(static\s+)?(async\s+)?(Task|void|\w+)\s+\w+\s*\(/,
];

const isBoundaryLine = (trimmed: string) =>
  BOUNDARY_PATTERNS.some((p) => p.test(trimmed));

function extractSymbolName(line: string): string | null {
  const match = line.match(
    /(?:function|class|interface|type|enum|struct|trait|impl|mod|def|fn|func)\s+(\w+)/,
  );
  if (match) return match[1];
  const constMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=/);
  return constMatch ? constMatch[1] : null;
}

function extractImportBlock(lines: string[]): string {
  const importLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.startsWith("import ") ||
      trimmed.startsWith("from ") ||
      trimmed.startsWith("require(") ||
      (trimmed.startsWith("const ") && trimmed.includes("require(")) ||
      trimmed.startsWith("use ") ||
      trimmed.startsWith("alias ") ||
      trimmed.startsWith("package ") ||
      trimmed.startsWith("#include ") ||
      trimmed.startsWith("#pragma ") ||
      trimmed.startsWith("using ") ||
      trimmed.startsWith("include ") ||
      trimmed.startsWith("require ") ||
      trimmed.startsWith("require_relative ") ||
      trimmed.startsWith("export '") ||
      trimmed === "" ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*")
    ) {
      importLines.push(line);
    } else {
      break;
    }
  }
  return importLines.join("\n").trim();
}

export interface CodeChunk {
  content: string;
  filePath: string;
  startLine: number;
  endLine: number;
  symbolName: string | null;
}

export function chunkCodeFile(filePath: string, content: string): CodeChunk[] {
  if (!content.trim()) return [];
  const lines = content.split("\n");
  const importBlock = extractImportBlock(lines);
  const importHeader = importBlock
    ? `// File: ${filePath}\n// Imports:\n${importBlock}\n\n`
    : `// File: ${filePath}\n\n`;

  const chunks: CodeChunk[] = [];
  let currentLines: string[] = [];
  let currentStart = 1;
  let currentSymbol: string | null = null;

  function flush() {
    if (currentLines.length === 0) return;
    const raw = currentLines.join("\n").trim();
    if (!raw) return;

    const isImportOnly =
      currentStart <= importBlock.split("\n").length + 1 && !currentSymbol;
    const prefix = isImportOnly ? `// File: ${filePath}\n\n` : importHeader;
    const prefixTokens = countTokens(prefix);
    const bodyLimit = Math.max(64, MAX_CHUNK_TOKENS - prefixTokens);
    const bodyChunks = splitByTokenLimit(raw, bodyLimit);

    for (const body of bodyChunks) {
      chunks.push({
        content: `${prefix}${body}`,
        filePath,
        startLine: currentStart,
        endLine: currentStart + currentLines.length - 1,
        symbolName: currentSymbol,
      });
    }
    currentLines = [];
    currentSymbol = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (isBoundaryLine(trimmed) && currentLines.length > 0) {
      flush();
      currentStart = i + 1;
      currentSymbol = extractSymbolName(trimmed);
    }
    currentLines.push(lines[i]);
    if (currentLines.length === 1 && isBoundaryLine(trimmed)) {
      currentSymbol = extractSymbolName(trimmed);
    }
  }
  flush();
  return chunks;
}

export interface WikiChunk {
  content: string;
  featureTitle: string;
  sectionHeading: string | null;
}

export function chunkWikiContent(
  featureTitle: string,
  featureSummary: string,
  markdownContent: string,
): WikiChunk[] {
  const chunks: WikiChunk[] = [];
  const summaryPrefix = `# ${featureTitle}\n\n`;
  const summaryBodyLimit = Math.max(
    64,
    MAX_CHUNK_TOKENS - countTokens(summaryPrefix),
  );
  for (const body of splitByTokenLimit(featureSummary, summaryBodyLimit)) {
    chunks.push({
      content: `${summaryPrefix}${body}`,
      featureTitle,
      sectionHeading: null,
    });
  }

  const sections = markdownContent.split(/(?=^## )/m);
  for (const section of sections) {
    if (!section.trim()) continue;
    const headingMatch = section.match(/^##\s+(.+)/m);
    const heading = headingMatch ? headingMatch[1].trim() : null;
    const contextPrefix = `[Feature: ${featureTitle}]${heading ? ` [Section: ${heading}]` : ""}\n\n`;
    const prefixTokens = countTokens(contextPrefix);
    const bodyLimit = Math.max(64, MAX_CHUNK_TOKENS - prefixTokens);
    const bodyChunks = splitByTokenLimit(section.trim(), bodyLimit);

    for (const body of bodyChunks) {
      chunks.push({
        content: `${contextPrefix}${body}`,
        featureTitle,
        sectionHeading: heading,
      });
    }
  }
  return chunks;
}

export function chunkOverview(overview: string): string[] {
  const sections = overview.split(/(?=^## )/m);
  const chunks: string[] = [];
  for (const section of sections) {
    if (!section.trim()) continue;
    chunks.push(...splitByTokenLimit(section.trim()));
  }
  return chunks;
}
