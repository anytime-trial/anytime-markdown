import { test, expect } from "@playwright/test";

/**
 * 設定パネルを開くヘルパー
 * サイドツールバーの設定アイコンをクリック
 */
async function openSettingsPanel(page: import("@playwright/test").Page) {
  const settingsBtn = page.getByRole("button", { name: "Editor Settings" });
  await expect(settingsBtn).toBeVisible();
  await settingsBtn.click();
  // 設定パネルの Drawer が表示されるまで待機
  await expect(page.locator("#settings-panel-title")).toBeVisible({ timeout: 10000 });
}

test.describe("Settings", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/markdown");
    await page.locator(".tiptap").waitFor({ state: "visible" });
  });

  test("toggle dark/light theme", async ({ page }) => {
    // 初期状態の背景色を取得
    const initialBg = await page.evaluate(() =>
      window.getComputedStyle(document.body).backgroundColor
    );

    // 設定パネルを開く
    await openSettingsPanel(page);

    // ダークモードの Switch をクリック（設定パネル内の最初の switch）
    const darkModeSwitch = page.getByRole("switch").first();
    await expect(darkModeSwitch).toBeVisible();
    await darkModeSwitch.click();

    // 設定パネルを閉じる（Close ボタン、WebKit では force で遮蔽回避）
    await page.getByRole("button", { name: "Close" }).click({ force: true });

    // 背景色が変わっていることを確認
    await expect.poll(async () => {
      return page.evaluate(() =>
        window.getComputedStyle(document.body).backgroundColor
      );
    }).not.toBe(initialBg);
  });

  test("switch language en/ja", async ({ page }) => {
    // 設定パネルを開く
    await openSettingsPanel(page);

    // 初期状態（英語）で設定パネルのタイトルが英語であることを確認
    await expect(page.locator("#settings-panel-title")).toHaveText("Editor Settings");

    // 言語セレクターで日本語を選択
    const jaButton = page.getByRole("button", { name: "日本語" });
    await expect(jaButton).toBeVisible();
    await jaButton.click();

    // ロケール切替後、設定パネル内のラベルが日本語に変わることを確認
    // 「Editor Settings」→「エディタ設定」
    await expect(page.locator("#settings-panel-title")).toHaveText("エディタ設定", { timeout: 10000 });

    // ステータスバーのテキストも日本語に変わることを確認（「chars」→「文字」）
    await page.getByRole("button", { name: "閉じる" }).click();
    await expect(page.getByText("文字")).toBeVisible({ timeout: 5000 });
  });

  test("change font size", async ({ page }) => {
    // 初期フォントサイズを取得
    const initialFontSize = await page.locator(".tiptap").evaluate(el =>
      window.getComputedStyle(el).fontSize
    );

    // 設定パネルを開く
    await openSettingsPanel(page);

    // Font Size スライダーを特定
    const fontSizeSlider = page.getByRole("slider", { name: "Font Size" });
    await expect(fontSizeSlider).toBeVisible();

    // スライダーの現在値を取得
    const currentValue = await fontSizeSlider.getAttribute("aria-valuenow");
    const current = Number(currentValue);

    // キーボードで値を変更（ArrowRight で +1px ずつ増加）
    await fontSizeSlider.focus();
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("ArrowRight");
    }

    // 設定パネルを閉じる
    await page.getByRole("button", { name: "Close" }).click();

    // .tiptap の font-size CSS が変わったことを確認
    await expect.poll(async () => {
      return page.locator(".tiptap").evaluate(el =>
        window.getComputedStyle(el).fontSize
      );
    }).not.toBe(initialFontSize);
  });
});
