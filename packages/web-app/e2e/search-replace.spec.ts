import { test, expect } from "./coverage.fixture";
import { openEmptyEditor } from "./helpers";

test.describe("Search and Replace", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openEmptyEditor(page);
    // WebKit/Firefox でエディタの初期化完了を待つ
    await page.locator(".tiptap").click();
    await page.waitForTimeout(300);
  });

  test("search highlights matches", async ({ page }) => {
    const editor = page.locator(".tiptap");
    // 繰り返し単語を含むテキストを入力
    await page.keyboard.type("apple banana apple cherry apple");

    // Ctrl+F で検索バーを開く
    await page.keyboard.press("Control+f");

    // 検索入力フィールドに検索語を入力
    const searchInput = page.getByRole("textbox", { name: "Search" });
    await expect(searchInput).toBeVisible();
    await searchInput.fill("apple");

    // デバウンス(200ms) + デコレーション反映を待つ
    await expect(editor.locator(".search-match, .search-match-current").first()).toBeVisible({ timeout: 3000 });

    // ハイライトが3箇所あることを確認
    const highlights = editor.locator(".search-match, .search-match-current");
    await expect(highlights).toHaveCount(3);
  });

  test("replace text", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await page.keyboard.type("foo bar foo baz foo");

    // Ctrl+H で検索/置換を開く
    await page.keyboard.press("Control+h");

    // 検索語を入力
    const searchInput = page.getByRole("textbox", { name: "Search" });
    await expect(searchInput).toBeVisible();
    await searchInput.fill("foo");

    // デバウンス待ち
    await expect(editor.locator(".search-match, .search-match-current").first()).toBeVisible({ timeout: 3000 });

    // 置換語を入力
    const replaceInput = page.getByRole("textbox", { name: "Replace" });
    await expect(replaceInput).toBeVisible();
    await replaceInput.fill("qux");

    // Replace All ボタンをクリック
    await page.getByRole("button", { name: "Replace All" }).click();

    // 置換結果を確認
    await expect(editor).toContainText("qux bar qux baz qux");
    // 元の "foo" が残っていないことを確認
    await expect(editor).not.toContainText("foo");
  });

  test("regex search", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await page.keyboard.type("cat123 dog456 cat789");

    // Ctrl+F で検索バーを開く
    await page.keyboard.press("Control+f");

    // 検索バーが表示されるまで待機
    const searchInput = page.getByRole("textbox", { name: "Search" });
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    // まず検索語を入力（検索バーが確実に開いている状態で）
    await searchInput.fill("cat123");

    // デバウンス待ち - マッチが確認できたら検索バーは確実に動作中
    await expect(editor.locator(".search-match, .search-match-current").first()).toBeVisible({ timeout: 3000 });

    // 正規表現モードを有効にする
    const regexBtn = page.getByRole("button", { name: "Use Regular Expression" });
    await regexBtn.click();

    // 検索語を正規表現パターンに変更
    await searchInput.clear();
    await searchInput.fill("cat\\d+");

    // デバウンス + デコレーション反映を待つ
    await expect(editor.locator(".search-match, .search-match-current").first()).toBeVisible({ timeout: 3000 });

    // "cat123" と "cat789" の2箇所がハイライトされることを確認
    const highlights = editor.locator(".search-match, .search-match-current");
    await expect(highlights).toHaveCount(2);
  });
});
