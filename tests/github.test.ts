import { describe, expect, it, vi } from "vitest";
import {
  GITHUB_REPO_RE,
  GITHUB_URL_RE,
  parseRepoUrl,
  filterTree,
  formatTreeString,
  repoGuard,
} from "@shared/github";
import type { TreeEntry } from "@shared/types";

describe("GitHub URL regexes", () => {
  it.each([
    "marcelroed/gigatoken",
    "https://github.com/marcelroed/gigatoken",
    "http://www.github.com/marcelroed/gigatoken",
    "https://github.com/marcelroed/gigatoken/",
  ])("parseRepoUrl extracts owner/repo from %s", (url) => {
    expect(parseRepoUrl(url)).toEqual({
      owner: "marcelroed",
      repo: "gigatoken",
    });
  });

  it("throws for invalid input", () => {
    expect(() => parseRepoUrl("not-a-repo")).toThrow("Invalid GitHub URL");
    expect(() => parseRepoUrl("")).toThrow("Invalid GitHub URL");
  });

  it("GITHUB_URL_RE matches repo URLs", () => {
    expect(GITHUB_URL_RE.test("https://github.com/owner/repo")).toBe(true);
    expect(GITHUB_URL_RE.test("http://github.com/owner/repo/extra")).toBe(true);
    expect(GITHUB_URL_RE.test("not-a-url")).toBe(false);
  });

  it("GITHUB_REPO_RE matches bare owner/repo", () => {
    const match = "owner/repo".match(GITHUB_REPO_RE);
    expect(match?.[1]).toBe("owner");
    expect(match?.[2]).toBe("repo");
  });
});

describe("filterTree", () => {
  it("keeps blobs and ignores node_modules, lockfiles and build dirs", () => {
    const entries = [
      { path: "src/index.ts", type: "blob" },
      { path: "node_modules/foo/index.js", type: "blob" },
      { path: "package-lock.json", type: "blob" },
      { path: "dist/index.js", type: "blob" },
      { path: "src", type: "tree" },
    ] as unknown as TreeEntry[];

    const filtered = filterTree(entries);
    expect(filtered.map((e) => e.path)).toEqual(["src/index.ts"]);
  });
});

describe("formatTreeString", () => {
  it("joins paths with newlines", () => {
    const entries = [
      { path: "src/index.ts", type: "blob" },
      { path: "src/lib.ts", type: "blob" },
    ] as unknown as TreeEntry[];
    expect(formatTreeString(entries)).toBe("src/index.ts\nsrc/lib.ts");
  });
});

describe("repoGuard", () => {
  it("resolves when GitHub responds 200", async () => {
    const fakeResponse = { ok: true, status: 200 } as Response;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse));
    process.env.GITHUB_API_URL = "https://api.github.com";

    await expect(
      repoGuard("marcelroed", "gigatoken"),
    ).resolves.toBe(fakeResponse);

    vi.unstubAllGlobals();
  });

  it("throws HttpError when GitHub responds 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "Not Found",
      } as Response),
    );
    process.env.GITHUB_API_URL = "https://api.github.com";

    await expect(repoGuard("owner", "missing")).rejects.toThrow(/404/);

    vi.unstubAllGlobals();
  });
});
