import { test, expect } from "@playwright/test";

test.describe("Console Errors", () => {
  test("no console errors on landing page", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        // S3 未設定時の API エラーとそれに伴う翻訳キー不足は除外
        if (text.includes("/api/docs/") || text.includes("MISSING_MESSAGE") || text.includes("Failed to load resource")) return;
        errors.push(text);
      }
    });

    await page.goto("/");
    // ページの描画完了を待機
    await page.getByRole("link", { name: /open editor/i }).first().waitFor({ state: "visible" });
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
        errors.push(msg.text());
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
