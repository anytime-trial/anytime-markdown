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
    // 初期状態では max-width が設定されていないことを確認
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

  test("paper size OFF removes max-width", async ({ page }) => {
    // まず A4 に設定
    await openSettingsPanel(page);
    const paperSizeSelect = page.getByLabel("Paper Size");
    await paperSizeSelect.click();
    await page.getByRole("option", { name: "A4" }).click();

    // A4 が適用されたことを確認
    await expect.poll(async () => {
      return page.locator(".tiptap").evaluate(el =>
        window.getComputedStyle(el).maxWidth
      );
    }).not.toBe("none");

    // OFF に戻す
    await paperSizeSelect.click();
    await page.getByRole("option", { name: "OFF" }).click();

    // 設定パネルを閉じる
    await page.getByRole("button", { name: "Close" }).click({ force: true });

    // max-width が none に戻ることを確認
    await expect.poll(async () => {
      return page.locator(".tiptap").evaluate(el =>
        window.getComputedStyle(el).maxWidth
      );
    }).toBe("none");
  });
});
