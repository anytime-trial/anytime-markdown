import { test, expect } from "./coverage.fixture";
import { openEmptyEditor } from "./helpers";

test.describe("Slash Commands - Extended", () => {
  test.beforeEach(async ({ page }) => {
    await openEmptyEditor(page);
  });

  test("/h2 inserts heading 2", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("/h2");
    const menu = page.getByRole("menu", { name: "Type to filter..." });
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: /Heading 2/i }).click();
    // スラッシュメニュー閉→エディタ再フォーカスが整う前に高速タイプすると先頭キーが落ちるため、
    // 短い settle 後に低速タイプする（人間の入力では発生しない e2e 固有の競合の安定化）。
    await page.waitForTimeout(100);
    await page.keyboard.type("Test H2", { delay: 25 });
    await expect(editor.locator("h2")).toContainText("Test H2");
  });

  test("/plantuml inserts PlantUML code block", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("/plantuml");
    const menu = page.getByRole("menu", { name: "Type to filter..." });
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: /PlantUML/i }).click();
    // 図ブロックは codeCollapsed=true が既定でソース pre は折りたたまれる（図をレンダリング表示）。
    // 挿入されたこと自体は DOM 上の存在で検証する。
    await expect(editor.locator("pre")).toBeAttached();
  });

  test("/math inserts math code block", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("/math");
    const menu = page.getByRole("menu", { name: "Type to filter..." });
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: /Math Equation/i }).click();
    // 図ブロックは codeCollapsed=true が既定でソース pre は折りたたまれる。存在で検証する。
    await expect(editor.locator("pre")).toBeAttached();
  });

  test("/toc inserts table of contents", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    // まず見出しを作成
    await page.keyboard.type("/h1");
    const menu1 = page.getByRole("menu", { name: "Type to filter..." });
    await expect(menu1).toBeVisible();
    await menu1.getByRole("menuitem", { name: /Heading 1/i }).click();
    // メニュー閉→再フォーカス待ち（先頭キー欠落の安定化）。
    await page.waitForTimeout(100);
    await page.keyboard.type("First Heading", { delay: 25 });
    await page.keyboard.press("Enter");

    await page.keyboard.type("/h2");
    const menu2 = page.getByRole("menu", { name: "Type to filter..." });
    await expect(menu2).toBeVisible();
    await menu2.getByRole("menuitem", { name: /Heading 2/i }).click();
    await page.waitForTimeout(100);
    await page.keyboard.type("Second Heading", { delay: 25 });
    await page.keyboard.press("Enter");

    // TOC を挿入
    await page.keyboard.type("/toc");
    const menu3 = page.getByRole("menu", { name: "Type to filter..." });
    await expect(menu3).toBeVisible();
    await menu3.getByRole("menuitem", { name: /Table of Contents/i }).click();
    // TOC には見出しテキストへのリンクが含まれる
    await expect(editor).toContainText("First Heading");
    await expect(editor).toContainText("Second Heading");
  });

  test("/footnote inserts footnote reference", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    // スラッシュコマンドは空行の先頭でのみ発火するため、
    // まずテキストを入力し、Enter で新しい行に移動してからコマンドを実行
    await page.keyboard.type("Some text");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/footnote");
    const menu = page.getByRole("menu", { name: "Type to filter..." });
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: /Footnote/i }).click();
    // footnoteRef の native NodeView（React 非依存）は span[data-footnote-ref] を出力する
    await expect(
      editor.locator("span[data-footnote-ref]").first(),
    ).toBeVisible();
    // 脚注番号のテキスト（[数字]形式）が表示されることを確認
    await expect(editor).toContainText(/\[\d+\]/);
  });
});
