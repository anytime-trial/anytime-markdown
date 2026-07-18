import { defineConfig, devices } from "@playwright/test";

/**
 * 受入ファーム（自律受入基盤 S1）専用の Playwright 設定。
 * 既存 e2e（playwright.config.ts）とはレイヤーが異なる: 対象は markdown-viewer standalone の
 * ハーネス（file://）で、web-app の devserver を必要としない。
 *
 * retries は 0 に固定する — flaky 判定は farm ランナー（scripts/acceptance/farm.mjs）が
 * 失敗テストの明示的な再実行で行うため、自動 retry は flaky を隠す方向に働く。
 */
export default defineConfig({
  testDir: "./e2e-acceptance",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/acceptance-report.json" }]],
  // ローカル完結の farm 前提のため platform サフィックスなしの固定パスで基準画像を管理する
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFileName}/{arg}{ext}",
  expect: {
    toHaveScreenshot: {
      // 同一ホストの決定論レンダリング前提のため画素色差の閾値を既定(0.2)より締める。
      // 0.05 未満の極微小な色ずれ（例: #ffffff→#fffcfc 級）は不検出 — その領域は S2 の
      // VLM 前処理と人手抜き取りが受け持つ（要件書 §4.2 / §6。校正は運用で行う）
      threshold: 0.05,
      maxDiffPixelRatio: 0.001,
    },
  },
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1000, height: 700 },
  },
});
