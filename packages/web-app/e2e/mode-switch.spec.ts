import { test, expect } from "@playwright/test";
import { openEmptyEditor } from "./helpers";

test.describe("Mode Switch", () => {
  test.beforeEach(async ({ page }) => {
    await openEmptyEditor(page);
  });

  test("switch to source mode and back preserves content", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("Test content for mode switch");

    // ソースモードに切替
    await page.getByRole("button", { name: /source/i }).click();
    // ソースエディタ（textarea）が表示される
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue(/Test content for mode switch/);

    // 編集モードに戻す
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.locator(".tiptap")).toContainText("Test content for mode switch");
  });

  test("edit markdown in source mode reflects in edit mode", async ({ page }) => {
    // ソースモードに切替
    await page.getByRole("button", { name: /source/i }).click();
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();
    await textarea.click();
    await page.keyboard.press("Control+a");
    await textarea.fill("# Heading from Source\n\nParagraph text");

    // 編集モードに戻す
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const editor = page.locator(".tiptap");
    await expect(editor.locator("h1")).toContainText("Heading from Source");
    await expect(editor).toContainText("Paragraph text");
  });
});
