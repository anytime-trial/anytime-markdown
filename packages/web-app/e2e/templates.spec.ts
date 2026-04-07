import { test, expect } from "./coverage.fixture";
import { openEmptyEditor } from "./helpers";

test.describe("Templates", () => {
  test.beforeEach(async ({ page }) => {
    await openEmptyEditor(page);
  });

  test("insert Welcome template via slash command", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("/");
    await page.waitForTimeout(300);
    await page.keyboard.type("welcome");
    await page.waitForTimeout(200);
    const item = page.getByRole("menuitem").first();
    await item.click();
    // Welcome template should contain "Anytime Markdown"
    await expect(editor).toContainText("Anytime Markdown", { timeout: 5000 });
  });

  test("insert Basic Design template via slash command", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("/");
    await page.waitForTimeout(300);
    await page.keyboard.type("design");
    await page.waitForTimeout(200);
    const item = page.getByRole("menuitem").first();
    await item.click();
    // Basic Design template should contain "Overview"
    await expect(editor).toContainText("Overview", { timeout: 5000 });
  });

  test("insert API Spec template via slash command", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("/");
    await page.waitForTimeout(300);
    await page.keyboard.type("api");
    await page.waitForTimeout(200);
    const item = page.getByRole("menuitem").first();
    await item.click();
    await expect(editor).toContainText("API", { timeout: 5000 });
  });
});
