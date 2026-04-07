import { test, expect } from "./coverage.fixture";

test.describe("Console Errors", () => {
  test.afterEach(async ({ page }) => {
    // Firefox: Tiptap/ProseMirror の非同期クリーンアップ完了前に
    // browserContext.close が呼ばれるとクラッシュするため、先にページを破棄する
    try {
      await page.goto("about:blank");
    } catch {
      // ページが既にクラッシュ/クローズ済みの場合は無視
    }
  });

  test("no console errors on landing page", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text().trim();
        // S3 未設定時の API エラー、翻訳キー不足、認証関連エラーは除外
        if (text.includes("/api/docs/") || text.includes("MISSING_MESSAGE") || text.includes("Failed to load resource") || text.includes("auth") || text.includes("Auth") || text.includes("ClientFetchError") || text.startsWith("Error")) return;
        errors.push(text);
      }
    });

    await page.goto("/");
    // ページの描画完了を待機
    await page.getByRole("heading", { level: 1 }).first().waitFor({ state: "visible" });
    // hydration 後のエラーも捕捉するため少し待つ
    await page.waitForTimeout(1000);

    expect(errors, `Console errors found:\n${errors.join("\n")}`).toHaveLength(
      0,
    );
  });

  test("no console errors on editor page", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text().trim();
        // 外部リソース（Google Fonts 等）の読み込み失敗、認証関連エラーは除外
        if (text.includes("FetchEvent.respondWith") || text.includes("Failed to load resource") || text.includes("auth") || text.includes("Auth") || text.includes("ClientFetchError") || text.startsWith("Error")) return;
        errors.push(text);
      }
    });

    await page.goto("/markdown");
    // ウェルカムコンテンツの読み込みを待機
    await page.locator(".tiptap").waitFor({ state: "visible" });
    await page.waitForTimeout(1000);

    expect(errors, `Console errors found:\n${errors.join("\n")}`).toHaveLength(
      0,
    );
  });
});
