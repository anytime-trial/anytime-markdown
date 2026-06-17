/**
 * `anytime-chart` フェンスコードブロックの視覚回帰 (VR) スペック。
 *
 * NOTE: baseline 生成は実機で要実行。
 * このファイルはスペック定義のみ。`npx playwright test chart-fence-vr` はブラウザ基盤が
 * 必要なため CI 外の実機環境で実行すること。
 *
 * 基準スナップショット生成コマンド（実機）:
 *   npx playwright test chart-fence-vr --project=chromium --update-snapshots
 *
 * 通常の差分検証:
 *   npx playwright test chart-fence-vr --project=chromium
 */

import { test, expect } from "@playwright/test";

/** markdown エディタに書き込む anytime-chart フェンスのサンプルコンテンツ。 */
const CHART_FENCE_CONTENT = `\`\`\`anytime-chart
{
  "kind": "line",
  "categories": ["Jan", "Feb", "Mar"],
  "series": [
    { "name": "Sales", "values": [100, 200, 150] }
  ]
}
\`\`\``;

const CONTENT_KEY = "markdown-editor-content";
const MODE_KEY = "anytime-markdown-theme-mode";

const SHOT = {
  animations: "disabled",
  caret: "hide",
  maxDiffPixelRatio: 0.02,
} as const;

for (const mode of ["light", "dark"] as const) {
  test.describe(`anytime-chart VR — ${mode}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.addInitScript(
        ({ contentKey, modeKey, content, modeVal }) => {
          localStorage.setItem(contentKey, content);
          localStorage.setItem(modeKey, modeVal);
        },
        {
          contentKey: CONTENT_KEY,
          modeKey: MODE_KEY,
          content: CHART_FENCE_CONTENT,
          modeVal: mode,
        },
      );
      await page.goto("/markdown");
      await page.locator(".tiptap").waitFor({ state: "visible" });
      // フォント読み込みと描画完了を待つ
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(
        () =>
          new Promise<void>((r) =>
            requestAnimationFrame(() => requestAnimationFrame(() => r())),
          ),
      );
    });

    test("anytime-chart フェンスが canvas として描画される", async ({ page }) => {
      // anytime-chart カスタム要素が描画されるのを待つ
      const chartEl = page.locator("anytime-chart").first();
      await expect(chartEl).toBeVisible({ timeout: 10_000 });
      // canvas が内部にあることを確認
      const canvas = chartEl.locator("canvas");
      await expect(canvas).toBeVisible({ timeout: 5_000 });
    });

    test(`chart canvas の VR スナップショット — ${mode}`, async ({ page }) => {
      const chartEl = page.locator("anytime-chart").first();
      await expect(chartEl).toBeVisible({ timeout: 10_000 });
      await expect(chartEl).toHaveScreenshot(`chart-fence-${mode}.png`, SHOT);
    });
  });
}
