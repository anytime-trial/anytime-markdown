import { test, expect } from "@playwright/test";

test.describe("File Operations", () => {
  test.beforeEach(async ({ page }) => {
    // デスクトップ幅でツールバーボタンを表示
    await page.setViewportSize({ width: 1280, height: 720 });
    // File System Access API を無効化して Upload/Download ボタンを表示
    await page.addInitScript(() => {
      delete (window as Record<string, unknown>)["showOpenFilePicker"];
      delete (window as Record<string, unknown>)["showSaveFilePicker"];
    });
    await page.goto("/");
    await page.locator(".tiptap").waitFor({ state: "visible" });
    // ウェルカムコンテンツをクリア
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Backspace");
  });

  test("download markdown file", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("Download test content");
    await expect(editor).toContainText("Download test content");

    // ダウンロードイベントを待機しつつ Download ボタンをクリック
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /Download/i }).click(),
    ]);

    // .md ファイルがダウンロードされることを確認
    expect(download.suggestedFilename()).toMatch(/\.md$/);
  });

  test("upload markdown file", async ({ page }) => {
    // hidden file input にファイルをセット
    const fileInput = page.locator('input[type="file"][accept*=".md"]');

    // テスト用の .md ファイルをアップロード
    await fileInput.setInputFiles({
      name: "test-upload.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Uploaded Heading\n\nUploaded paragraph content"),
    });

    // エディタにアップロード内容が反映されることを確認
    const editor = page.locator(".tiptap");
    await expect(editor).toContainText("Uploaded Heading");
    await expect(editor).toContainText("Uploaded paragraph content");
  });

  test("create new clears content", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("Content to be cleared");
    await expect(editor).toContainText("Content to be cleared");

    // Create New ボタンをクリック
    await page.getByRole("button", { name: /Create New/i }).click();

    // MUI 確認ダイアログが表示される — OK ボタンをクリック
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "OK" }).click();

    // コンテンツがクリアされることを確認
    await expect(editor).not.toContainText("Content to be cleared");
  });
});
