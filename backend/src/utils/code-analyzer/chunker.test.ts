import { describe, it, expect } from "vitest";
import { chunkCodeFile, chunkWikiContent, chunkOverview } from "./chunker.js";

describe("chunkCodeFile", () => {
  it("returns an empty array for empty content", () => {
    expect(chunkCodeFile("src/index.ts", "")).toEqual([]);
  });

  it("produces a chunk for small files", () => {
    const code = "export function hello() {\n  return 1;\n}";
    const chunks = chunkCodeFile("src/index.ts", code);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].filePath).toBe("src/index.ts");
    expect(chunks[0].content).toContain("export function hello()");
    expect(chunks[0].symbolName).toBe("hello");
  });

  it("splits content on function boundaries", () => {
    const code = [
      "export function one() {",
      "  return 1;",
      "}",
      "export function two() {",
      "  return 2;",
      "}",
    ].join("\n");

    const chunks = chunkCodeFile("src/index.ts", code);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const names = chunks.map((c) => c.symbolName);
    expect(names).toContain("one");
    expect(names).toContain("two");
  });
});

describe("chunkWikiContent", () => {
  it("chunks a feature with a summary", () => {
    const chunks = chunkWikiContent(
      "Getting Started",
      "Install the package with npm.",
      "## Usage\n\nRun the CLI.\n",
    );
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].featureTitle).toBe("Getting Started");
    expect(chunks[0].content).toContain("# Getting Started");
  });

  it("handles empty markdown", () => {
    const chunks = chunkWikiContent("Feature", "Summary", "");
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => c.featureTitle === "Feature")).toBe(true);
  });
});

describe("chunkOverview", () => {
  it("splits an overview into sections", () => {
    const overview = "## Intro\n\nText.\n## Details\n\nMore text.";
    const chunks = chunkOverview(overview);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toContain("Intro");
    expect(chunks[1]).toContain("Details");
  });
});
