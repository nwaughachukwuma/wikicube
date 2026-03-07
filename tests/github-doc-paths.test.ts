import { describe, expect, test } from "vitest";
import { DOC_PATH_RE } from "../src/lib/github";

describe("DOC_PATH_RE", () => {
  test.each([
    "docs/intro.md",
    "docs/index.mdx",
    "docs/zh/readme.md",
    "docs/pt-br/summary.mdx",
    "docs/guides/setup/index.md",
    "docs/reference/api/authentication.mdx",
    "docs/README.md",
    "DOCS/Guide.MD",
  ])("matches %s", (path) => {
    expect(DOC_PATH_RE.test(path)).toBe(true);
  });

  test.each([
    "readme.md",
    "src/docs/index.md",
    "docs",
    "docs/",
    "docs/readme.txt",
    "docs/image.png",
    "docs/index.mdown",
    "packages/docs/index.md",
  ])("does not match %s", (path) => {
    expect(DOC_PATH_RE.test(path)).toBe(false);
  });
});