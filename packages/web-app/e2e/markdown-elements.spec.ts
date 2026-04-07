import { test, expect } from "./coverage.fixture";
import { openEmptyEditor } from "./helpers";

test.describe("Markdown Elements", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openEmptyEditor(page);
  });

  test("スラッシュコマンドで箇条書きリストを挿入", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("/bullet");
    const menu = page.getByRole("menu", { name: "Type to filter..." });
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: /Bullet List/i }).click();
    await expect(editor.locator("ul")).toBeVisible();
  });

  test("スラッシュコマンドで番号付きリストを挿入", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("/ordered");
    const menu = page.getByRole("menu", { name: "Type to filter..." });
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: /Numbered List/i }).click();
    await expect(editor.locator("ol")).toBeVisible();
  });

  test("スラッシュコマンドでタスクリストを挿入", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("/task");
    const menu = page.getByRole("menu", { name: "Type to filter..." });
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: /Task List/i }).click();
    await expect(editor.locator("ul[data-type='taskList']")).toBeVisible();
  });

  test("スラッシュコマンドで引用を挿入", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("/quote");
    const menu = page.getByRole("menu", { name: "Type to filter..." });
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: /^Quote$/i }).click();
    await expect(editor.locator("blockquote")).toBeVisible();
  });

  test("スラッシュコマンドで日付を挿入", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("/date");
    const menu = page.getByRole("menu", { name: "Type to filter..." });
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: /Date/i }).click();
    // YYYY-MM-DD 形式の日付が挿入される
    const today = new Date().toISOString().split("T")[0];
    await expect(editor).toContainText(today);
  });

});
