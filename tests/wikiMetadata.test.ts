import { describe, expect, test } from "vitest";
import { buildWikiMetadata } from "../src/lib/wikiMetadata";

describe("buildWikiMetadata", () => {
  test("public wiki uses overview as description", () => {
    const metadata = buildWikiMetadata({
      owner: "marcelroed",
      repo: "gigatoken",
      visibility: "public",
      overview: "# Gigatoken\n\nA **fast** tokenizer for large datasets.",
    });

    expect(metadata.title).toBe("marcelroed/gigatoken · WikiCube");
    expect(metadata.description).toContain("fast tokenizer");
    expect(metadata.description).not.toContain("**");
    expect(metadata.openGraph).toMatchObject({
      title: "marcelroed/gigatoken · WikiCube",
      type: "website",
      url: "https://wikicube.vercel.app/wiki/marcelroed/gigatoken",
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: "marcelroed/gigatoken · WikiCube",
    });
  });

  test("private wiki uses generic description and does not leak overview", () => {
    const metadata = buildWikiMetadata({
      owner: "nwaughachukwuma",
      repo: "secret-repo",
      visibility: "private",
      overview: "This is a private overview that must not appear in metadata.",
    });

    expect(metadata.description).toBe(
      "AI-generated wiki for nwaughachukwuma/secret-repo",
    );
    expect(metadata.description).not.toContain("private overview");
    expect(metadata.openGraph?.description).toBe(metadata.description);
    expect(metadata.twitter?.description).toBe(metadata.description);
  });

  test("missing wiki falls back to generic description", () => {
    const metadata = buildWikiMetadata({ owner: "foo", repo: "bar" });

    expect(metadata.description).toBe("AI-generated wiki for foo/bar");
    expect(metadata.title).toBe("foo/bar · WikiCube");
  });

  test("public wiki with no overview falls back to generic description", () => {
    const metadata = buildWikiMetadata({
      owner: "foo",
      repo: "bar",
      visibility: "public",
    });

    expect(metadata.description).toBe("AI-generated wiki for foo/bar");
  });

  test("long overview is truncated to ~160 characters", () => {
    const longOverview = "Lorem ipsum ".repeat(50);
    const metadata = buildWikiMetadata({
      owner: "foo",
      repo: "bar",
      visibility: "public",
      overview: longOverview,
    });

    const description = String(metadata.description);
    expect(description.length).toBeLessThanOrEqual(156);
    expect(description).not.toContain("  ");
  });

  test("markdown is stripped from overview", () => {
    const metadata = buildWikiMetadata({
      owner: "foo",
      repo: "bar",
      visibility: "public",
      overview:
        "## Heading\n\n```python\nprint('hello')\n```\n\nVisit [link](https://example.com).",
    });

    const description = String(metadata.description);
    expect(description).toContain("Heading");
    expect(description).toContain("link");
    expect(description).not.toContain("```python");
    expect(description).not.toContain("[link]");
  });

  test("custom siteUrl is used for openGraph url", () => {
    const metadata = buildWikiMetadata({
      owner: "foo",
      repo: "bar",
      visibility: "public",
      overview: "Overview text.",
      siteUrl: "https://example.com",
    });

    expect(metadata.openGraph?.url).toBe("https://example.com/wiki/foo/bar");
  });
});
