import { test, expect } from "./coverage.fixture";
import { openEmptyEditor } from "./helpers";

test.describe("Keyboard Shortcuts", () => {
  test.beforeEach(async ({ page }) => {
    await openEmptyEditor(page);
  });

  test("バブルメニューから Bold を適用・解除", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("bold test");
    await page.keyboard.press("Control+a");
    // バブルメニューの Bold ボタンをクリック
    const boldBtn = page.getByRole("button", { name: "Bold" });
    await expect(boldBtn).toBeVisible();
    await boldBtn.click();
    await expect(editor.locator("strong")).toContainText("bold test");
    // もう一度クリックで Bold 解除
    await boldBtn.click();
    await expect(editor.locator("strong")).toHaveCount(0);
    await expect(editor).toContainText("bold test");
  });

  test("Ctrl+Z undoes and Ctrl+Shift+Z redoes", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("first");
    await page.keyboard.type(" second");
    await expect(editor).toContainText("first second");
    // Ctrl+Z で undo: 追加テキストが消える
    await page.keyboard.press("Control+z");
    await expect(editor).not.toContainText("second");
    // Ctrl+Shift+Z で redo: 追加テキストが戻る
    await page.keyboard.press("Control+Shift+z");
    await expect(editor).toContainText("first second");
  });

  test("Ctrl+S triggers save (no error)", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    // ページエラーを監視
    const errors: Error[] = [];
    page.on("pageerror", (err) => errors.push(err));
    // Ctrl+S を押下
    await page.keyboard.press("Control+s");
    // 少し待機してエラーが発生しないことを確認
    await page.waitForTimeout(500);
    expect(errors).toHaveLength(0);
  });
});
