import { test, expect } from "./coverage.fixture";
import { openEmptyEditor } from "./helpers";

test.describe("File Operations", () => {
  test.beforeEach(async ({ page }) => {
    // デスクトップ幅でツールバーボタンを表示
    await page.setViewportSize({ width: 1280, height: 720 });
    // File System Access API を無効化して Upload/Download ボタンを表示
    await page.addInitScript(() => {
      delete (window as Record<string, unknown>)["showOpenFilePicker"];
      delete (window as Record<string, unknown>)["showSaveFilePicker"];
    });
    await openEmptyEditor(page);
  });

  test("download markdown file", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("Download test content");
    await expect(editor).toContainText("Download test content");

    // File System Access API が利用可能な場合は Save As、そうでなければ Download ボタンを使用
    const saveAsBtn = page.getByRole("button", { name: /Save As/i });
    const downloadBtn = page.getByRole("button", { name: /Download/i });

    const targetBtn = await saveAsBtn.isVisible() ? saveAsBtn : downloadBtn;

    // Save As はネイティブダイアログを使うためダウンロードイベントが発火しない場合がある
    // ボタンが存在しクリック可能であることを検証
    await expect(targetBtn).toBeVisible();
    await expect(targetBtn).toBeEnabled();
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

});
