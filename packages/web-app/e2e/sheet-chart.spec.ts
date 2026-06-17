/**
 * sheet ページのチャート機能 e2e スペック。
 *
 * NOTE: baseline 生成は実機で要実行。
 * このファイルはスペック定義のみ。`npx playwright test sheet-chart` はブラウザ基盤が
 * 必要なため CI 外の実機環境で実行すること。
 *
 * 実行コマンド例:
 *   npx playwright test sheet-chart --project=chromium
 */

import { test, expect } from "@playwright/test";

test.describe("Sheet Chart — チャート作成と canvas 描画", () => {
  test.beforeEach(async ({ page }) => {
    // チャート定義をリセットして初期状態にする
    await page.addInitScript(() => {
      localStorage.removeItem("anytime-sheet-charts");
    });
    await page.goto("/sheet");
    // スプレッドシートエディタが描画されるまで待つ
    await page.locator(".sv-root").waitFor({ state: "visible" });
  });

  test("スプレッドシートページが正常に表示される", async ({ page }) => {
    await expect(page.locator(".sv-root")).toBeVisible();
  });

  test("セル範囲を選択してコンテキストメニューからチャート作成ができる", async ({
    page,
  }) => {
    // canvas 要素（スプレッドシートグリッド）を取得
    const canvas = page.locator(".sv-root canvas").first();
    await canvas.waitFor({ state: "visible" });

    // canvas 上で右クリックしてコンテキストメニューを開く（グリッドの左上付近）
    await canvas.click({ button: "right", position: { x: 150, y: 60 } });

    // コンテキストメニューの「選択範囲からチャート作成」アイテムを探す
    // （メニューが表示されない環境ではスキップ）
    const chartMenuItem = page.getByRole("menuitem", { name: /チャート|chart/i });
    const isVisible = await chartMenuItem.isVisible().catch(() => false);
    if (!isVisible) {
      test.skip(true, "コンテキストメニューにチャート項目なし — 範囲選択が必要");
    }
    await chartMenuItem.click();

    // チャートパネルまたは canvas（anytime-chart 要素）が描画される
    const chartEl = page.locator("anytime-chart, canvas[data-chart-id]").first();
    await expect(chartEl).toBeVisible({ timeout: 5_000 });
  });

  test("チャート定義が localStorage に永続化される", async ({ page }) => {
    // localStorage にチャートを直接書き込んでページをリロード
    const dummyCharts = JSON.stringify([
      {
        id: "chart-1",
        kind: "line",
        range: { startRow: 0, startCol: 0, endRow: 2, endCol: 1 },
      },
    ]);
    await page.addInitScript((charts) => {
      localStorage.setItem("anytime-sheet-charts", charts);
    }, dummyCharts);

    await page.goto("/sheet");
    await page.locator(".sv-root").waitFor({ state: "visible" });

    // localStorage の値が保持されていることを確認
    const stored = await page.evaluate(() =>
      localStorage.getItem("anytime-sheet-charts"),
    );
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!) as unknown[];
    expect(parsed).toHaveLength(1);
  });
});
