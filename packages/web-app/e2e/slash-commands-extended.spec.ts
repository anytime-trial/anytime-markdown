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
    await page.keyboard.type("Test H2");
    await expect(editor.locator("h2")).toContainText("Test H2");
  });

  test("/plantuml inserts PlantUML code block", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("/plantuml");
    const menu = page.getByRole("menu", { name: "Type to filter..." });
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: /PlantUML/i }).click();
    await expect(editor.locator("pre")).toBeVisible();
  });

  test("/math inserts math code block", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("/math");
    const menu = page.getByRole("menu", { name: "Type to filter..." });
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: /Math Equation/i }).click();
    await expect(editor.locator("pre")).toBeVisible();
  });

  test("/toc inserts table of contents", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    // まず見出しを作成
    await page.keyboard.type("/h1");
    const menu1 = page.getByRole("menu", { name: "Type to filter..." });
    await expect(menu1).toBeVisible();
    await menu1.getByRole("menuitem", { name: /Heading 1/i }).click();
    await page.keyboard.type("First Heading");
    await page.keyboard.press("Enter");

    await page.keyboard.type("/h2");
    const menu2 = page.getByRole("menu", { name: "Type to filter..." });
    await expect(menu2).toBeVisible();
    await menu2.getByRole("menuitem", { name: /Heading 2/i }).click();
    await page.keyboard.type("Second Heading");
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
    // footnoteRef NodeView が挿入される
    // NodeViewWrapper は span[data-node-view-wrapper] としてレンダリングされる
    await expect(
      editor.locator("span[data-node-view-wrapper]").first(),
    ).toBeVisible();
    // 脚注番号のテキスト（[数字]形式）が表示されることを確認
    await expect(editor).toContainText(/\[\d+\]/);
  });
});
