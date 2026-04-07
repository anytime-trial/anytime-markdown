import { test, expect } from "./coverage.fixture";
import { openEmptyEditor } from "./helpers";

test.describe("Editor Basic", () => {
  test("page loads with editor and toolbar", async ({ page }) => {
    await page.goto("/markdown");
    await page.locator(".tiptap").waitFor({ state: "visible" });
    // ツールバーが表示される
    await expect(page.getByRole("toolbar", { name: /editor/i })).toBeVisible();
    // エディタ領域が表示される
    await expect(page.locator(".tiptap")).toBeVisible();
    // ステータスバーが表示される（文字数表示）
    await expect(page.getByText(/chars/i)).toBeVisible();
  });

  test("can type text in editor", async ({ page }) => {
    await openEmptyEditor(page);
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("Hello Playwright");
    await expect(editor).toContainText("Hello Playwright");
  });

  test("can apply bold formatting via bubble menu", async ({ page }) => {
    await openEmptyEditor(page);
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("bold text");
    // テキスト選択
    await page.keyboard.press("Control+a");
    // バブルメニューの Bold ボタンをクリック
    const boldButton = page.locator('[aria-label="Bold"]');
    await boldButton.click();
    // <strong> が適用されている
    await expect(editor.locator("strong")).toContainText("bold text");
  });
});
