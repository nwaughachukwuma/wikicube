import { test, expect } from "@playwright/test";
import {
  PUBLIC_WIKI_OWNER,
  PUBLIC_WIKI_REPO,
  PRIVATE_WIKI_OWNER,
  PRIVATE_WIKI_REPO,
  PRIVATE_WIKI_OVERVIEW,
} from "./fixtures";

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
      `/wiki/${PRIVATE_WIKI_OWNER}/${PRIVATE_WIKI_REPO}`,
      { maxRedirects: 0 },
    );

    const status = response.status();
    expect(status).toBeGreaterThanOrEqual(300);
    expect(status).toBeLessThan(400);
  });

  test("private indexed wiki does not leak overview in metadata", async ({
    context,
  }) => {
    const response = await context.request.get(
      `/wiki/${PRIVATE_WIKI_OWNER}/${PRIVATE_WIKI_REPO}`,
      { maxRedirects: 0 },
    );

    const body = await response.text().catch(() => "");
    expect(body).not.toContain(PRIVATE_WIKI_OVERVIEW);
  });
});
