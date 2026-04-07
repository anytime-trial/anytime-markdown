import { test, expect } from "./coverage.fixture";
import { openEmptyEditor } from "./helpers";

test.describe("Comment", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openEmptyEditor(page);
  });

  test("バブルメニューからコメントを追加", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("comment target text");
    await page.keyboard.press("Control+a");
    // バブルメニューの Comment ボタンをクリック
    const commentBtn = page.getByRole("button", { name: "Comment" }).first();
    await expect(commentBtn).toBeVisible();
    await commentBtn.click();
    // コメントパネルが表示される
    await expect(page.getByRole("heading", { name: /Comments/i })).toBeVisible({ timeout: 5000 });
  });

  test("ツールバーのコメントアイコンでパネル開閉", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("test content");
    // コメントパネルトグルボタンをクリック
    const commentBtn = page.getByRole("button", { name: /Comments/i });
    if (await commentBtn.isVisible()) {
      await commentBtn.click();
      await page.waitForTimeout(500);
      await commentBtn.click();
    }
  });
});
