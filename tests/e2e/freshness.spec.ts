import { test, expect } from "@playwright/test";
import { PRIVATE_WIKI_OWNER, PRIVATE_WIKI_REPO, signIn } from "./fixtures";

const wikiPath = `/wiki/${PRIVATE_WIKI_OWNER}/${PRIVATE_WIKI_REPO}`;

test.describe("private wiki freshness banner", () => {
  test("offers to regenerate a wiki whose repo has moved on", async ({
    context,
    page,
  }) => {
    await signIn(context);
    const refreshRequests: string[] = [];
    await page.route(`**/api${wikiPath}/refresh`, (route) => {
      refreshRequests.push(route.request().method());
      return route.fulfill({ status: 202, json: { status: "refreshing" } });
    });

    await page.goto(wikiPath);

    const stale = page
      .getByRole("status")
      .filter({ hasText: "The repo has changed" });
    await expect(stale).toContainText("aaaaaaa → bbbbbbb");

    await stale.getByRole("button", { name: "Regenerate" }).click();

    await expect(
      page.getByRole("status").filter({ hasText: "Regenerating" }),
    ).toBeVisible();
    expect(refreshRequests).toEqual(["POST"]);
  });
});
