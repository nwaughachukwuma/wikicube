import { test, expect, type Page } from "@playwright/test";
import { PUBLIC_WIKI_OWNER, PUBLIC_WIKI_REPO, USER, signIn } from "./fixtures";

const repos = Array.from({ length: 25 }, (_, i) => ({
  id: i + 1,
  full_name: `e2e-user/repo-${i + 1}`,
  name: `repo-${i + 1}`,
  owner: { login: "e2e-user" },
  description: null,
  private: false,
  updated_at: "2024-01-01T00:00:00Z",
  stargazers_count: 0,
  language: null,
  hasWiki: false,
}));

const challenges = Array.from({ length: 25 }, (_, i) => ({
  id: `challenge-${i + 1}`,
  wiki_id: "wiki-1",
  role: `Role ${i + 1}`,
  background: "Background",
  objective: `Objective ${i + 1}`,
  task: "Task",
  acceptance_criteria: "Criteria",
  created_at: `2024-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
}));

/** Fire the event supabase-js listens to when the browser tab regains focus. */
function simulateTabFocus(page: Page) {
  return page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true })),
  );
}

test.describe("URL-backed paging", () => {
  test("/my-repos keeps the page across tab focus, reload and back navigation", async ({
    page,
    context,
  }) => {
    await signIn(context);
    await page.route("**/auth/v1/user", (route) =>
      route.fulfill({ json: USER }),
    );
    await page.route("**/api/my-repos**", (route) =>
      route.fulfill({ json: repos }),
    );

    await page.goto("/my-repos?page=3");
    await expect(page.getByText("3 / 3", { exact: true })).toBeVisible();
    await expect(page.getByText("21–25 of 25 repos")).toBeVisible();

    // Tab focus makes supabase-js re-emit SIGNED_IN with a fresh user object,
    // which re-runs the repos effect. The page must not reset.
    const refetch = page.waitForRequest("**/api/my-repos**");
    await simulateTabFocus(page);
    await refetch;
    await expect(page.getByText("3 / 3", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/my-repos\?page=3$/);

    await page.reload();
    await expect(page.getByText("3 / 3", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Previous page" }).click();
    await expect(page).toHaveURL(/\/my-repos\?page=2$/);
    await expect(page.getByText("2 / 3", { exact: true })).toBeVisible();

    await page.goto("/");
    await page.goBack();
    await expect(page).toHaveURL(/\/my-repos\?page=2$/);
    await expect(page.getByText("2 / 3", { exact: true })).toBeVisible();
  });

  test("/my-repos clamps an out-of-range page and drops the param on page 1", async ({
    page,
    context,
  }) => {
    await signIn(context);
    await page.route("**/auth/v1/user", (route) =>
      route.fulfill({ json: USER }),
    );
    await page.route("**/api/my-repos**", (route) =>
      route.fulfill({ json: repos }),
    );

    await page.goto("/my-repos?page=99");
    await expect(page.getByText("3 / 3", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Previous page" }).click();
    await expect(page.getByText("2 / 3", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Previous page" }).click();
    await expect(page.getByText("1 / 3", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/my-repos$/);
  });

  test("/challenges keeps the page across navigation and reload", async ({
    page,
  }) => {
    await page.route(
      `**/api/challenges/${PUBLIC_WIKI_OWNER}/${PUBLIC_WIKI_REPO}`,
      (route) => route.fulfill({ json: { challenges } }),
    );

    await page.goto(
      `/challenges/${PUBLIC_WIKI_OWNER}/${PUBLIC_WIKI_REPO}?page=2`,
    );
    await expect(page.getByText("Page 2 / 3")).toBeVisible();

    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page).toHaveURL(/\?page=3$/);
    await expect(page.getByText("Page 3 / 3")).toBeVisible();

    await page.reload();
    await expect(page.getByText("Page 3 / 3")).toBeVisible();
  });
});
