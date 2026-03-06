import { test, expect } from "@playwright/test";

test.describe("Mode Switch", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/markdown");
    await page.locator(".tiptap").waitFor({ state: "visible" });
  });

  test("switch to source mode and back preserves content", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("Test content for mode switch");

    // ソースモードに切替
    await page.getByRole("button", { name: /source/i }).click();
    // ソースエディタ（textarea）が表示される
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue(/Test content for mode switch/);

    // WYSIWYG モードに戻す
    await page.getByRole("button", { name: /wysiwyg/i }).click();
    await expect(page.locator(".tiptap")).toContainText("Test content for mode switch");
  });

  test("edit markdown in source mode reflects in WYSIWYG", async ({ page }) => {
    // ソースモードに切替
    await page.getByRole("button", { name: /source/i }).click();
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();
    await textarea.click();
    await page.keyboard.press("Control+a");
    await textarea.fill("# Heading from Source\n\nParagraph text");

    // WYSIWYG に戻す
    await page.getByRole("button", { name: /wysiwyg/i }).click();
    const editor = page.locator(".tiptap");
    await expect(editor.locator("h1")).toContainText("Heading from Source");
    await expect(editor).toContainText("Paragraph text");
  });
});
