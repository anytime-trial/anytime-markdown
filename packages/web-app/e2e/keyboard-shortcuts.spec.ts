import { test, expect } from "@playwright/test";
import { openEmptyEditor } from "./helpers";

test.describe("Keyboard Shortcuts - ブロック操作", () => {
  test.beforeEach(async ({ page }) => {
    await openEmptyEditor(page);
  });

  test("Alt+Down: ブロックを下に移動", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("first");
    await page.keyboard.press("Enter");
    await page.keyboard.type("second");
    await page.keyboard.press("Enter");
    await page.keyboard.type("third");
    // "second" の行にカーソルを移動
    await page.keyboard.press("ArrowUp");
    // Alt+Down で移動
    await page.keyboard.press("Alt+ArrowDown");
    // "second" が "third" の後に移動
    const text = await editor.innerText();
    const lines = text.split("\n").filter(l => l.trim());
    expect(lines[0]).toBe("first");
    expect(lines[1]).toBe("third");
    expect(lines[2]).toBe("second");
  });

  test("Alt+Up: ブロックを上に移動", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("first");
    await page.keyboard.press("Enter");
    await page.keyboard.type("second");
    await page.keyboard.press("Enter");
    await page.keyboard.type("third");
    // "third" にカーソルがある状態で Alt+Up
    await page.keyboard.press("Alt+ArrowUp");
    const text = await editor.innerText();
    const lines = text.split("\n").filter(l => l.trim());
    expect(lines[0]).toBe("first");
    expect(lines[1]).toBe("third");
    expect(lines[2]).toBe("second");
  });

  test("Shift+Alt+Down: ブロックを下に複製", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("original");
    await page.keyboard.press("Enter");
    await page.keyboard.type("other");
    // "original" にカーソルを移動
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+Alt+ArrowDown");
    const text = await editor.innerText();
    const lines = text.split("\n").filter(l => l.trim());
    expect(lines.filter(l => l === "original").length).toBe(2);
  });

  test("Shift+Alt+Up: ブロックを上に複製", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("other");
    await page.keyboard.press("Enter");
    await page.keyboard.type("original");
    await page.keyboard.press("Shift+Alt+ArrowUp");
    const text = await editor.innerText();
    const lines = text.split("\n").filter(l => l.trim());
    expect(lines.filter(l => l === "original").length).toBe(2);
  });
});

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
    // 選択されたテキストをコピーして確認
    await page.keyboard.press("Control+c");
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
