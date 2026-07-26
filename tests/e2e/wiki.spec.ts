import { test, expect } from "@playwright/test";

const PUBLIC_WIKI_OWNER = "marcelroed";
const PUBLIC_WIKI_REPO = "gigatoken";

const UNAUTHORIZED_OWNER = "nwaughachukwuma";
const UNAUTHORIZED_REPO = "private-wikicube-e2e";

test.describe("/wiki/[owner]/[repo] metadata", () => {
  test("public wiki renders dynamic owner/repo meta tags", async ({ page }) => {
    await page.goto(`/wiki/${PUBLIC_WIKI_OWNER}/${PUBLIC_WIKI_REPO}`);

    await expect(page).toHaveTitle(
      new RegExp(`${PUBLIC_WIKI_OWNER}/${PUBLIC_WIKI_REPO} · WikiCube`),
    );

    const description = await page
      .locator('meta[name="description"]')
      .getAttribute("content");
    expect(description).toBeTruthy();

    const ogTitle = await page
      .locator('meta[property="og:title"]')
      .getAttribute("content");
    expect(ogTitle).toContain(`${PUBLIC_WIKI_OWNER}/${PUBLIC_WIKI_REPO}`);

    const ogUrl = await page
      .locator('meta[property="og:url"]')
      .getAttribute("content");
    expect(ogUrl).toContain(
      `/wiki/${PUBLIC_WIKI_OWNER}/${PUBLIC_WIKI_REPO}`,
    );
  });

  test("public wiki meta tags are not the generic site defaults", async ({
    page,
  }) => {
    await page.goto(`/wiki/${PUBLIC_WIKI_OWNER}/${PUBLIC_WIKI_REPO}`);

    const title = await page.title();
    expect(title).not.toBe("WikiCube — Instant Wiki for Any GitHub Repo");
  });

  test("unauthorized/private repo does not render a wiki page", async ({
    context,
  }) => {
    // Private (or non-existent) repos are gated by auth and should redirect
    // before any wiki overview can be rendered in the response.
    const response = await context.request.get(
      `/wiki/${UNAUTHORIZED_OWNER}/${UNAUTHORIZED_REPO}`,
      { maxRedirects: 0 },
    );

    const status = response.status();
    expect(status).toBeGreaterThanOrEqual(300);
    expect(status).toBeLessThan(400);
  });

  const privateOwner = process.env.E2E_PRIVATE_WIKI_OWNER;
  const privateRepo = process.env.E2E_PRIVATE_WIKI_REPO;
  const privateOverviewSnippet = process.env.E2E_PRIVATE_WIKI_OVERVIEW_SNIPPET;

  test("private indexed wiki does not leak overview in metadata", async ({
    context,
  }) => {
    test.skip(
      !privateOwner || !privateRepo || !privateOverviewSnippet,
      "E2E_PRIVATE_WIKI_* env vars not set",
    );

    const response = await context.request.get(
      `/wiki/${privateOwner}/${privateRepo}`,
      { maxRedirects: 0 },
    );

    const body = await response.text().catch(() => "");
    expect(body).not.toContain(privateOverviewSnippet);
  });
});
