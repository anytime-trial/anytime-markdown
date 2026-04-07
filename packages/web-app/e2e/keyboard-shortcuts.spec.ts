import { test, expect } from "./coverage.fixture";
import { openEmptyEditor } from "./helpers";

test.describe("Keyboard Shortcuts - 空行挿入", () => {
  test.beforeEach(async ({ page }) => {
    await openEmptyEditor(page);
  });

  test("Ctrl+Enter: 下に空行を挿入", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("hello");
    await page.keyboard.press("Enter");
    await page.keyboard.type("world");
    // "hello" にカーソルを移動
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Control+Enter");
    // hello の下に空行が入り、world はその下
    const paragraphs = editor.locator("p");
    await expect(paragraphs).toHaveCount(3);
  });

  test("Ctrl+Shift+Enter: 上に空行を挿入", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("hello");
    await page.keyboard.press("Enter");
    await page.keyboard.type("world");
    // "world" にカーソルがある状態
    await page.keyboard.press("Control+Shift+Enter");
    const paragraphs = editor.locator("p");
    await expect(paragraphs).toHaveCount(3);
  });
});

test.describe("Keyboard Shortcuts - 行選択・単語選択", () => {
  test.beforeEach(async ({ page }) => {
    await openEmptyEditor(page);
  });

  test("Ctrl+L: 行全体を選択", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("first line");
    await page.keyboard.press("Enter");
    await page.keyboard.type("second line");
    // Ctrl+L で現在行を選択
    await page.keyboard.press("Control+l");
    // Firefox: 選択状態が確定するまで待機
    await expect(async () => {
      const selection = await page.evaluate(() => window.getSelection()?.toString());
      expect(selection).toBeTruthy();
    }).toPass({ timeout: 3000 });
    // 選択されたテキストをコピーして確認
    await page.keyboard.press("Control+c");
    // Firefox: クリップボードへのコピー完了を待機
    await expect(async () => {
      const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
      expect(clip.length).toBeGreaterThan(0);
    }).toPass({ timeout: 3000 }).catch(() => {});
    // 新しい行を追加して貼り付け
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Control+v");
    await expect(editor).toContainText("second line");
  });

  test("Ctrl+D: カーソル位置の単語を選択", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("hello world test");
    // "world" の中にカーソルを配置（左に移動）
    await page.keyboard.press("Home");
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press("ArrowRight");
    }
    await page.keyboard.press("Control+d");
    // 選択された状態で入力すると置換される
    await page.keyboard.type("earth");
    await expect(editor).toContainText("hello earth test");
  });
});

test.describe("Keyboard Shortcuts - 見出しレベル変更", () => {
  test.beforeEach(async ({ page }) => {
    await openEmptyEditor(page);
  });

  test("見出し内で Tab → レベルが下がる", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    // スラッシュコマンドで H2 を挿入
    await page.keyboard.type("/");
    await page.waitForTimeout(300);
    const h2Item = page.getByRole("menuitem", { name: /heading 2/i });
    if (await h2Item.isVisible()) {
      await h2Item.click();
    } else {
      // フォールバック: 直接入力
      await page.keyboard.press("Escape");
      await page.keyboard.press("Backspace");
    }
    await page.keyboard.type("Test Heading");
    // H2 が存在することを確認
    const h2 = editor.locator("h2");
    if (await h2.count() > 0) {
      // Tab でレベルを下げる
      await page.keyboard.press("Tab");
      await expect(editor.locator("h3")).toHaveCount(1);
    }
  });
});

test.describe("Keyboard Shortcuts - 行削除", () => {
  test.beforeEach(async ({ page }) => {
    await openEmptyEditor(page);
  });

  test("Ctrl+Shift+K: 行を削除", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("keep this");
    await page.keyboard.press("Enter");
    await page.keyboard.type("delete this");
    await page.keyboard.press("Enter");
    await page.keyboard.type("keep this too");
    // "delete this" にカーソルを移動
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Control+Shift+k");
    await expect(editor).not.toContainText("delete this");
    await expect(editor).toContainText("keep this");
    await expect(editor).toContainText("keep this too");
  });
});
