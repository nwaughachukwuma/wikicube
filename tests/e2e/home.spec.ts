import { test, expect } from "@playwright/test";
import { PUBLIC_WIKI_OWNER, PUBLIC_WIKI_REPO } from "./fixtures";

test.describe("Homepage", () => {
  test("renders the hero and a working repo form", async ({ page }) => {
    await page.route("**/api/wikis/check", async (route) => {
      await route.fulfill({ json: [{ hasWiki: false }] });
    });
    await page.goto("/");

    await expect(page).toHaveTitle(/WikiCube/);
    await expect(
      page.getByRole("heading", { name: /Instant Wiki/i }),
    ).toBeVisible();

    const input = page.getByPlaceholder("github.com/owner/repo");
    await input.fill(`github.com/${PUBLIC_WIKI_OWNER}/${PUBLIC_WIKI_REPO}`);

    const submit = page.getByRole("button", { name: /Generate/i });
    await expect(submit).toBeEnabled();
    await submit.click();

    await page.waitForURL(`/wiki/${PUBLIC_WIKI_OWNER}/${PUBLIC_WIKI_REPO}`);
    await expect(page).toHaveTitle(
      new RegExp(`${PUBLIC_WIKI_OWNER}/${PUBLIC_WIKI_REPO} · WikiCube`),
    );
  });

  test("rejects an existing wiki entered using a short URL", async ({
    page,
  }) => {
    await page.route("**/api/wikis/check", async (route) => {
      await route.fulfill({ json: [{ hasWiki: true }] });
    });
    await page.goto("/");

    await page
      .getByPlaceholder("github.com/owner/repo")
      .fill(`${PUBLIC_WIKI_OWNER}/${PUBLIC_WIKI_REPO}`);
    await page.getByRole("button", { name: /Generate/i }).click();

    await expect(
      page.getByText(
        `A wiki for ${PUBLIC_WIKI_OWNER}/${PUBLIC_WIKI_REPO} already exists.`,
      ),
    ).toBeVisible();
    await expect(page).toHaveURL("/");
  });

  test("disables generate until a valid repo URL is entered", async ({
    page,
  }) => {
    await page.goto("/");
    const input = page.getByPlaceholder("github.com/owner/repo");
    const submit = page.getByRole("button", { name: /Generate/i });

    await expect(submit).toBeDisabled();
    await input.fill("not-a-repo");
    await expect(submit).toBeDisabled();
  });
});
