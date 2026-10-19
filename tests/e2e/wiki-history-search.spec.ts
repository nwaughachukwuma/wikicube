import { test, expect } from "@playwright/test";

const now = new Date().toISOString();
const WIKIS = [
  ["vercel", "next.js"],
  ["facebook", "react"],
  ["tailwindlabs", "tailwindcss"],
  ["supabase", "supabase"],
  ["krisk", "Fuse"],
  ["pmndrs", "zustand"],
  ["browser-use", "browser-use"],
  ["Textualize", "rich-cli"],
  ["tastejs", "todomvc"],
  ["microsoft", "playwright"],
  ["openai", "openai-node"],
  ["shikijs", "shiki"],
  ["remarkjs", "react-markdown"],
  ["colinhacks", "zod"],
  ["vitest-dev", "vitest"],
  ["eslint", "eslint"],
  ["marcelroed", "gigatoken"],
  ["denoland", "deno"],
].map(([owner, repo], i) => ({
  id: `w${i}`,
  owner,
  repo,
  status: "done",
  created_at: now,
  updated_at: now,
}));

test.describe("Wiki history search", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/wikis", (route) =>
      route.fulfill({ json: WIKIS }),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Open wiki history" }).click();
  });

  test("filters repos with typo-tolerant keyword search", async ({ page }) => {
    const search = page.getByRole("searchbox", { name: "Search repos" });
    await expect(search).toBeFocused();

    // Small typo still matches
    await search.fill("reactt");
    await expect(page.getByText(/\d+ results?/)).toBeVisible();
    const links = page.getByRole("listitem").getByRole("link");
    await expect(links.first()).toHaveAttribute("href", "/wiki/facebook/react");

    // Multiple keywords narrow the results
    await search.fill("remark react");
    await expect(page.getByText("1 result")).toBeVisible();
    await expect(links).toHaveCount(1);

    await search.fill("zzzqqq");
    await expect(page.getByText("No repos match")).toBeVisible();

    // Escape clears, then closes
    await search.press("Escape");
    await expect(search).toHaveValue("");
    await expect(page.getByText("Today")).toBeVisible();
  });

  test("waits for a pause in typing before filtering", async ({ page }) => {
    const search = page.getByRole("searchbox", { name: "Search repos" });
    await expect(page.getByText("Today")).toBeVisible();
    await page.clock.install();

    await search.pressSequentially("zod");
    await expect(page.getByText("Today")).toBeVisible();
    await expect(page.getByText(/\d+ results?/)).toHaveCount(0);

    await page.clock.runFor(250);
    await expect(page.getByText("1 result")).toBeVisible();

    // Clearing restores the full list immediately
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(page.getByText("Today")).toBeVisible();
  });

  test("Enter opens the top match", async ({ page }) => {
    const search = page.getByRole("searchbox", { name: "Search repos" });
    await search.fill("gigatoken");
    await search.press("Enter");
    await page.waitForURL("/wiki/marcelroed/gigatoken");
  });

  test("search stays pinned while the list scrolls", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 520 });
    const search = page.getByRole("searchbox", { name: "Search repos" });
    const before = await search.boundingBox();
    await page.locator('a[href="/wiki/denoland/deno"]').scrollIntoViewIfNeeded();
    const after = await search.boundingBox();
    expect(after?.y).toBe(before?.y);
  });
});
