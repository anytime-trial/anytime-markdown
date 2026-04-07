import { test, expect } from "./coverage.fixture";
import { openEmptyEditor } from "./helpers";

test.describe("Text Formatting", () => {
  test.beforeEach(async ({ page }) => {
    await openEmptyEditor(page);
  });

  test("バブルメニューから斜体を適用", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("italic test");
    await page.keyboard.press("Control+a");
    const italicBtn = page.getByRole("button", { name: "Italic" });
    await expect(italicBtn).toBeVisible();
    await italicBtn.click();
    await expect(editor.locator("em")).toContainText("italic test");
  });

  test("バブルメニューから下線を適用", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("underline test");
    await page.keyboard.press("Control+a");
    const underlineBtn = page.getByRole("button", { name: "Underline" });
    await expect(underlineBtn).toBeVisible();
    await underlineBtn.click();
    await expect(editor.locator("u")).toContainText("underline test");
  });

  test("バブルメニューから取消線を適用", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("strike test");
    await page.keyboard.press("Control+a");
    const strikeBtn = page.getByRole("button", { name: "Strikethrough" });
    await expect(strikeBtn).toBeVisible();
    await strikeBtn.click();
    await expect(editor.locator("s")).toContainText("strike test");
  });

  test("バブルメニューからインラインコードを適用", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("code test");
    await page.keyboard.press("Control+a");
    const codeBtn = page.getByRole("button", { name: "Code" });
    await expect(codeBtn).toBeVisible();
    await codeBtn.click();
    await expect(editor.locator("code")).toContainText("code test");
  });

  test("バブルメニューからハイライトを適用", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("highlight test");
    await page.keyboard.press("Control+a");
    const highlightBtn = page.getByRole("button", { name: "Highlight" });
    await expect(highlightBtn).toBeVisible();
    await highlightBtn.click();
    await expect(editor.locator("mark")).toContainText("highlight test");
  });

  test("バブルメニューからリンクダイアログが開く", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("link test");
    await page.keyboard.press("Control+a");
    const linkBtn = page.getByRole("button", { name: "Link" });
    await expect(linkBtn).toBeVisible();
    await linkBtn.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
  });

  test("タスクリストのチェックボックスをクリックで切替", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("/task");
    const menu = page.getByRole("menu", { name: "Type to filter..." });
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: /Task List/i }).click();
    await page.keyboard.type("task item");
    const checkbox = editor.locator('input[type="checkbox"]').first();
    await expect(checkbox).toBeVisible();
    await checkbox.click();
    await expect(checkbox).toBeChecked();
  });
});
