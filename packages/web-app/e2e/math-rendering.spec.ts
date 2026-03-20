import { test, expect } from "@playwright/test";
import { openEmptyEditor } from "./helpers";

test.describe("Math Rendering", () => {
  test.beforeEach(async ({ page }) => {
    await openEmptyEditor(page);
  });

  test("math code block renders KaTeX", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    // Insert math block via slash command
    await page.keyboard.type("/");
    await page.waitForTimeout(300);
    await page.keyboard.type("math");
    await page.waitForTimeout(200);
    await page.getByRole("menuitem").first().click();
    // Type a simple formula
    await page.keyboard.type("E = mc^2");
    // Click outside the code block to trigger rendering
    await editor.click({ position: { x: 10, y: 10 } });
    // Verify KaTeX rendered (look for .katex class in the rendered output)
    await expect(editor.locator(".katex")).toBeVisible({ timeout: 5000 });
  });
});
