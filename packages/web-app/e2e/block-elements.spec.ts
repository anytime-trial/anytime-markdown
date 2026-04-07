import { test, expect } from "./coverage.fixture";
import { openEmptyEditor } from "./helpers";

test.describe("Block Elements", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openEmptyEditor(page);
  });

  test("コードブロック挿入後にプレビューが表示される", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("/codeblock");
    const menu = page.getByRole("menu", { name: "Type to filter..." });
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: /Code Block/i }).click();
    // コードブロック（NodeView）が挿入される
    await expect(editor.locator("pre").first()).toBeVisible();
  });
});
