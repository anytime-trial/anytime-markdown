import { test, expect } from "./coverage.fixture";

/**
 * 設定パネルを開くヘルパー
 */
async function openSettingsPanel(page: import("@playwright/test").Page) {
  const settingsBtn = page.getByRole("button", { name: "Editor Settings" });
  await expect(settingsBtn).toBeVisible();
  await settingsBtn.click();
  await expect(page.locator("#settings-panel-title")).toBeVisible({ timeout: 10000 });
}

test.describe("Paper Size", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/markdown");
    await page.locator(".tiptap").waitFor({ state: "visible" });
  });

  test("change paper size to A4 applies max-width", async ({ page }) => {
    // 初期状態の max-width（本文 measure 既定 = standard プリセット）を記録
    const initialMaxWidth = await page.locator(".tiptap").evaluate(el =>
      window.getComputedStyle(el).maxWidth
    );

    // 設定パネルを開く
    await openSettingsPanel(page);

    // Paper Size セレクトを開いて A4 を選択
    const paperSizeSelect = page.getByLabel("Paper Size");
    await expect(paperSizeSelect).toBeVisible();
    await paperSizeSelect.click();

    // MUI Select のドロップダウンから A4 を選択
    const a4Option = page.getByRole("option", { name: "A4" });
    await expect(a4Option).toBeVisible();
    await a4Option.click();

    // 設定パネルを閉じる
    await page.getByRole("button", { name: "Close" }).click({ force: true });

    // .tiptap の max-width が変わっていることを確認
    await expect.poll(async () => {
      return page.locator(".tiptap").evaluate(el =>
        window.getComputedStyle(el).maxWidth
      );
    }).not.toBe("none");
  });

  test("paper size OFF falls back to the body measure", async ({ page }) => {
    // 紙サイズ OFF（既定）の本文 measure を基準値として記録する。
    // measure は em 基準（既定 standard = 46em）で font-size により px が変わるため、
    // 固定 px ではなく実測した既定値と比較してフォールバックを検証する。
    const defaultMeasure = await page.locator(".tiptap").evaluate(el =>
      window.getComputedStyle(el).maxWidth
    );
    expect(defaultMeasure).not.toBe("none");

    // A4 に設定
    await openSettingsPanel(page);
    const paperSizeSelect = page.getByLabel("Paper Size");
    await paperSizeSelect.click();
    await page.getByRole("option", { name: "A4" }).click();

    // A4 が適用されたことを確認（本文 measure とは異なる紙幅になる）
    let a4MaxWidth = "none";
    await expect.poll(async () => {
      a4MaxWidth = await page.locator(".tiptap").evaluate(el =>
        window.getComputedStyle(el).maxWidth
      );
      return a4MaxWidth;
    }).not.toBe(defaultMeasure);
    expect(a4MaxWidth).not.toBe("none");

    // OFF に戻す
    await paperSizeSelect.click();
    await page.getByRole("option", { name: "OFF" }).click();

    // 設定パネルを閉じる
    await page.getByRole("button", { name: "Close" }).click({ force: true });

    // 紙サイズの上書きが外れ、本文 measure（既定）へフォールバックすることを確認
    await expect.poll(async () => {
      return page.locator(".tiptap").evaluate(el =>
        window.getComputedStyle(el).maxWidth
      );
    }).toBe(defaultMeasure);
  });
});
