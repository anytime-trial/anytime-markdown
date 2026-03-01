import { test, expect } from "@playwright/test";

test.describe("Toolbar", () => {
  test.beforeEach(async ({ page }) => {
    // デスクトップ幅でツールバーボタンを表示
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await page.locator(".tiptap").waitFor({ state: "visible" });
    // ウェルカムコンテンツをクリア
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Backspace");
  });

  test("insert heading via slash command", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("/h1");
    // スラッシュコマンドメニューが表示される
    const menu = page.getByRole("listbox");
    await expect(menu).toBeVisible();
    // Heading 1 メニュー項目をクリック
    await menu.getByRole("menuitem", { name: /Heading 1/i }).click();
    // h1 要素が挿入される
    await expect(editor.locator("h1")).toBeVisible();
  });

  test("insert code block via toolbar", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    // ツールバーの Code Block ボタンをクリック
    await page.getByRole("button", { name: "Code Block" }).click();
    // pre > code 要素が挿入される
    await expect(editor.locator("pre code")).toBeVisible();
  });

  test("insert table via toolbar", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    // ツールバーの Insert Table ボタンをクリック
    await page.getByRole("button", { name: "Insert Table" }).click();
    // table 要素が挿入される
    await expect(editor.locator("table")).toBeVisible();
  });

  test("insert horizontal rule via toolbar", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    // ツールバーの Horizontal Rule ボタンをクリック
    await page.getByRole("button", { name: "Horizontal Rule" }).click();
    // hr 要素が挿入される
    await expect(editor.locator("hr")).toBeVisible();
  });

  test("diagram menu opens", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    // ツールバーの Insert Diagram ボタンをクリック
    await page.getByRole("button", { name: "Insert Diagram" }).click();
    // ダイアグラムメニューが開き、Mermaid オプションが表示される
    const diagramMenu = page.getByRole("menu", { name: /diagram menu/i });
    await expect(diagramMenu).toBeVisible();
    await expect(diagramMenu.getByRole("menuitem", { name: "Mermaid" })).toBeVisible();
  });
});
