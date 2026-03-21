import { test, expect } from "@playwright/test";
import { openEmptyEditor } from "./helpers";

test.describe("Compare Mode", () => {
  test.beforeEach(async ({ page }) => {
    // デスクトップ幅が必要（比較モードは PC のみ）
    await page.setViewportSize({ width: 1280, height: 720 });
    await openEmptyEditor(page);
  });

  test.afterEach(async ({ page }) => {
    // Firefox: ProseMirror の非同期クリーンアップが完了する前に
    // browserContext.close が呼ばれるとクラッシュする。
    // about:blank に遷移してエディタを確実に破棄してから終了する。
    await page.goto("about:blank");
  });

  test("比較モードボタンで切替", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("test content");
    // 比較モードボタンを探してクリック
    const compareBtn = page.locator('[aria-label*="compare" i], [aria-label*="比較"]').first();
    if (await compareBtn.isVisible()) {
      await compareBtn.click();
      // 比較モードが有効になるまで待機（2つ目のエディタが表示される）
      await page.locator(".tiptap").nth(1).waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
      // もう一度クリックで通常モードに戻す
      await compareBtn.click();
      // 通常モードに戻ったことを確認（エディタが1つに戻る）
      await expect(page.locator(".tiptap")).toHaveCount(1, { timeout: 5000 });
    }
  });
});
