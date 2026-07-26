import { test, expect } from "@playwright/test";

test.describe("/my-repos", () => {
  test("prompts unauthenticated users to log in", async ({ page }) => {
    await page.goto("/my-repos");
    await expect(page.getByText("My Repos")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Log in with GitHub/i }),
    ).toBeVisible();
  });
});
