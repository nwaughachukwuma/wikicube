/* ─── Chunker ─── */
import { encoding_for_model } from "tiktoken";

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
