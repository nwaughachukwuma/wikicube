/**
 * Contextual chunking for RAG — splits code and wiki content at meaningful boundaries.
 *
 * Code chunks: split at function/class/module boundaries with file path + import context preserved.
 * Wiki chunks: split at feature/section level with title + summary context preserved.
 */

/* ─── Code Chunking ─── */

interface CodeChunk {
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
];

/** Extract a symbol name from a boundary line */
function extractSymbolName(line: string): string | null {
  // Try to pull out function/class/type name
  const match = line.match(
    /(?:function|class|interface|type|enum|struct|trait|impl|mod|def|fn|func)\s+(\w+)/,
  );
  if (match) return match[1];

  // Arrow function or const assignment: const myFunc = ...
  const constMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=/);
  if (constMatch) return constMatch[1];

  return null;
}

/** Check if a line is a boundary */
function isBoundaryLine(trimmed: string): boolean {
  return BOUNDARY_PATTERNS.some((p) => p.test(trimmed));
}

/**
 * Extract the import/require block from the top of a file.
 * This context is prepended to every chunk from the file so
 * the embeddings capture module relationships.
 */
function extractImportBlock(lines: string[]): string {
  const importLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.startsWith("import ") ||
      trimmed.startsWith("from ") ||
      trimmed.startsWith("require(") ||
      (trimmed.startsWith("const ") && trimmed.includes("require(")) ||
      trimmed.startsWith("use ") || // Rust
      trimmed.startsWith("package ") || // Go/Java
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
export function chunkCodeFile(
  filePath: string,
  content: string,
  maxChunkSize = 1500,
): CodeChunk[] {
  const lines = content.split("\n");
  if (lines.length === 0) return [];

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
    const chunkContent = isImportOnly
      ? `// File: ${filePath}\n\n${raw}`
      : `${importHeader}${raw}`;

    // Respect max size — if oversized, split at line count
    if (chunkContent.length <= maxChunkSize) {
      chunks.push({
        content: chunkContent,
        filePath,
        startLine: currentStart,
        endLine: currentStart + currentLines.length - 1,
        symbolName: currentSymbol,
      });
    } else {
      // Split large blocks into sub-chunks
      const subSize = Math.ceil(maxChunkSize / 80); // ~lines per sub-chunk
      for (let i = 0; i < currentLines.length; i += subSize) {
        const slice = currentLines.slice(i, i + subSize);
        const subContent = `${importHeader}${slice.join("\n").trim()}`;
        chunks.push({
          content: subContent,
          filePath,
          startLine: currentStart + i,
          endLine: currentStart + i + slice.length - 1,
          symbolName: currentSymbol,
        });
      }
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

interface WikiChunk {
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
  maxChunkSize = 1500,
): WikiChunk[] {
  const chunks: WikiChunk[] = [];

  // Always include a "summary" chunk for the feature
  const summaryChunk = `# ${featureTitle}\n\n${featureSummary}`;
  chunks.push({
    content: summaryChunk,
    featureTitle,
    sectionHeading: null,
  });

  // Split on ## headings
  const sections = markdownContent.split(/(?=^## )/m);

  for (const section of sections) {
    if (!section.trim()) continue;

    // Extract heading
    const headingMatch = section.match(/^##\s+(.+)/m);
    const heading = headingMatch ? headingMatch[1].trim() : null;

    // Prefix with feature context
    const contextPrefix = `[Feature: ${featureTitle}]${heading ? ` [Section: ${heading}]` : ""}\n\n`;

    const fullSection = contextPrefix + section.trim();

    if (fullSection.length <= maxChunkSize) {
      chunks.push({
        content: fullSection,
        featureTitle,
        sectionHeading: heading,
      });
    } else {
      // Split large sections at paragraph boundaries
      const paragraphs = section.split(/\n\n+/);
      let current = contextPrefix;

      for (const para of paragraphs) {
        if (
          current.length + para.length > maxChunkSize &&
          current.length > contextPrefix.length
        ) {
          chunks.push({
            content: current.trim(),
            featureTitle,
            sectionHeading: heading,
          });
          current = contextPrefix;
        }
        current += para + "\n\n";
      }

      if (current.trim().length > contextPrefix.length) {
        chunks.push({
          content: current.trim(),
          featureTitle,
          sectionHeading: heading,
        });
      }
    }
  }

  return chunks;
}

/**
 * Chunk an overview page (no feature association).
 */
export function chunkOverview(overview: string, maxChunkSize = 1500): string[] {
  const sections = overview.split(/(?=^## )/m);
  const chunks: string[] = [];

  for (const section of sections) {
    if (!section.trim()) continue;

    if (section.length <= maxChunkSize) {
      chunks.push(section.trim());
    } else {
      const paragraphs = section.split(/\n\n+/);
      let current = "";
      for (const para of paragraphs) {
        if (current.length + para.length > maxChunkSize && current.length > 0) {
          chunks.push(current.trim());
          current = "";
        }
        current += para + "\n\n";
      }
      if (current.trim()) chunks.push(current.trim());
    }
  }

  return chunks;
}
