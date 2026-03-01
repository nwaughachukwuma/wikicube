/**
 * Contextual chunking for RAG — splits code and wiki content at meaningful boundaries.
 *
 * Code chunks: split at function/class/module boundaries with file path + import context preserved.
 * Wiki chunks: split at feature/section level with title + summary context preserved.
 *
 * Every chunk is guaranteed ≤ MAX_CHUNK_TOKENS (1024) so that batches of 7
 * stay safely within the text-embedding-3-small context window (8192 tokens).
 */

import { encoding_for_model } from "tiktoken";

/** Token budget per chunk */
export const MAX_CHUNK_TOKENS = 1024;
const encoder = encoding_for_model("gpt-4o-mini");

/** Count tokens accurately */
export const countTokens = (text: string) => encoder.encode(text).length;

/**
 * Split a single oversized text into pieces of at most `limit` tokens, using token-aware character slicing
 */
function splitByTokenLimit(text: string, limit = MAX_CHUNK_TOKENS): string[] {
  const tokens = encoder.encode(text);
  if (tokens.length <= limit) return [text];

  const pieces: string[] = [];
  for (let i = 0; i < tokens.length; i += limit) {
    const slice = tokens.slice(i, i + limit);
    pieces.push(new TextDecoder().decode(encoder.decode(slice)));
  }
  return pieces;
}

/* ─── Code Chunking ─── */

export interface CodeChunk {
  content: string;
  filePath: string;
  startLine: number;
  endLine: number;
  /** e.g. "function:handleAuth", "class:UserService", "module-header" */
  symbolName: string | null;
}

/** Patterns that mark the start of a semantic code boundary */
const BOUNDARY_PATTERNS = [
  // JS/TS
  /^(export\s+)?(default\s+)?(async\s+)?function\s+\w+/,
  /^(export\s+)?(default\s+)?class\s+\w+/,
  /^(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\(/,
  /^(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?function/,
  /^(export\s+)?interface\s+\w+/,
  /^(export\s+)?type\s+\w+/,
  /^(export\s+)?enum\s+\w+/,
  // := named function expressions
  /^(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\w+\s*=>/,
  /^(export\s+)?function\s+[A-Z]\w+/,
  /^@\w+/,
  // Python
  /^(async\s+)?def\s+\w+/,
  /^class\s+\w+/,
  // Rust
  /^(pub\s+)?(async\s+)?fn\s+\w+/,
  /^(pub\s+)?struct\s+\w+/,
  /^(pub\s+)?enum\s+\w+/,
  /^(pub\s+)?trait\s+\w+/,
  /^impl\s+/,
  /^(pub\s+)?mod\s+\w+/,
  // Go
  /^func\s+(\(\w+\s+\*?\w+\)\s+)?\w+/,
  /^type\s+\w+\s+(struct|interface)/,
  // Ruby
  /^(def|class|module)\s+\w+/,
  // Java/Kotlin
  /^(public|private|protected|internal)?\s*(static\s+)?(class|interface|enum|record|fun|suspend\s+fun)\s+\w+/,
  // Swift
  /^(public|private|internal)?\s*(class|struct|enum|protocol|actor)\s+\w+/,
  /^(public|private|internal)?\s*func\s+\w+/,
  // C++
  /^\w[\w\s:*&<>]*\s+\w+\s*\([^;]*\)\s*\{/,
  /^class\s+\w+/,
  /^struct\s+\w+/,
  /^template\s*</,
  // PHP
  /^(abstract\s+|final\s+)?class\s+\w+/,
  /^function\s+\w+\s*\(/,
  // Elixir
  /^defmodule\s+\w+/,
  /^\s*def\s+\w+/,
  /^\s*defp\s+\w+/,
  // Dart+Flutter
  /^(class|mixin|extension)\s+\w+/,
  /^\w+\s+\w+\s*\([^)]*\)\s*\{/,
  // C# + .NET
  /^(public|private|protected|internal)?\s*(static\s+)?(class|interface|enum|record|struct)\s+\w+/,
  /^(public|private|protected|internal)?\s*(static\s+)?(async\s+)?(Task|void|\w+)\s+\w+\s*\(/,
];

/**
 * Extract a symbol name from a boundary line - pull out function/class/type name
 */
function extractSymbolName(line: string): string | null {
  const match = line.match(
    /(?:function|class|interface|type|enum|struct|trait|impl|mod|def|fn|func)\s+(\w+)/,
  );
  if (match) return match[1];

  // Arrow function or const assignment: const myFunc = ...
  const constMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=/);
  return constMatch ? constMatch[1] : null;
}

/** Check if a line is a boundary */
const isBoundaryLine = (trimmed: string) =>
  BOUNDARY_PATTERNS.some((p) => p.test(trimmed));

/**
 * Extract the import/require block from the top of a file.
 * This context is prepended to every chunk from the file so
 * the embeddings capture module relationships.
 *
 * Covered constructs for language-aware chunking :
 * JS/TS, Python, PHP, Rust, Dart+Flutter, Go, Java/Kotlin/Scala
 * C/C++, C#+.Net, Swift, Ruby, Elixir, and more via common patterns.
 */
function extractImportBlock(lines: string[]): string {
  const importLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.startsWith("import ") ||
      trimmed.startsWith("from ") || // Python
      trimmed.startsWith("require(") ||
      (trimmed.startsWith("const ") && trimmed.includes("require(")) ||
      trimmed.startsWith("use ") || // Rust / Elixir
      trimmed.startsWith("alias ") || // Elixir
      trimmed.startsWith("package ") || // Go / Java / Kotlin / Scala
      trimmed.startsWith("#include ") || // C / C++
      trimmed.startsWith("#pragma ") || // C / C++
      trimmed.startsWith("using ") || // C#
      trimmed.startsWith("include ") || // PHP
      trimmed.startsWith("require ") || // Ruby
      trimmed.startsWith("require_relative ") || // Ruby
      trimmed.startsWith("export '") || // Dart re-export
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

/**
 * Chunk a source file at function/class/module boundaries.
 * Each chunk includes:
 * - File path as context header
 * - Import block (so embeddings capture dependency graph)
 * - The actual code block
 */
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

    // Only prepend import header if the chunk isn't itself the import block
    const isImportOnly =
      currentStart <= importBlock.split("\n").length + 1 && !currentSymbol;
    const prefix = isImportOnly ? `// File: ${filePath}\n\n` : importHeader;

    // Reserve tokens for the prefix so every sub-chunk includes it
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
      // Flush the previous block
      flush();
      currentStart = i + 1;
      currentSymbol = extractSymbolName(trimmed);
    }

    currentLines.push(lines[i]);
    // First boundary sets the symbol
    if (currentLines.length === 1 && isBoundaryLine(trimmed)) {
      currentSymbol = extractSymbolName(trimmed);
    }
  }

  flush();
  return chunks;
}

/* ─── Wiki Content Chunking ─── */

export interface WikiChunk {
  content: string;
  featureTitle: string;
  sectionHeading: string | null;
}

/**
 * Chunk wiki markdown at section boundaries (## headings).
 * Each chunk is prefixed with the feature title + section heading
 * so the embedding captures which feature/subsystem the content belongs to.
 */
export function chunkWikiContent(
  featureTitle: string,
  featureSummary: string,
  markdownContent: string,
): WikiChunk[] {
  const chunks: WikiChunk[] = [];

  // Always include a "summary" chunk for the feature — token-limited like everything else
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

  // Split on ## headings
  const sections = markdownContent.split(/(?=^## )/m);

  for (const section of sections) {
    if (!section.trim()) continue;

    // Extract heading
    const headingMatch = section.match(/^##\s+(.+)/m);
    const heading = headingMatch ? headingMatch[1].trim() : null;

    // Prefix with feature context
    const contextPrefix = `[Feature: ${featureTitle}]${heading ? ` [Section: ${heading}]` : ""}\n\n`;

    // Split section body so prefix + body fits within limit
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

/**
 * Chunk an overview page (no feature association).
 */
export function chunkOverview(overview: string): string[] {
  const sections = overview.split(/(?=^## )/m);
  const chunks: string[] = [];
  for (const section of sections) {
    if (!section.trim()) continue;
    chunks.push(...splitByTokenLimit(section.trim()));
  }

  return chunks;
}
