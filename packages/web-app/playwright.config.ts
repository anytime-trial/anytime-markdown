import { defineConfig } from "@playwright/test";

/**
 * chromium 以外のブラウザでは走らせない spec（CI の firefox / webkit から除外）。
 *
 * VR 基準画像（visual-baseline / chart-fence-vr）は Linux + chromium で生成し、a11y 基線
 * （e2e/a11y-baseline.json）も chromium の走査結果に固定された値のため、基線を取ったブラウザだけで判定する。
 * firefox / webkit は同じページでも別の axe 違反（select-name / aria-prohibited-attr 等）を報告し、
 * 2026-09-29〜10-06 の Daily Build Check を連日赤くした
 * （https://github.com/anytime-trial/anytime-markdown/actions/runs/36645792190）。
 * a11y は末尾アンカーで `a11y.spec.ts` 1 件に限定する（`foo-a11y.spec.ts` のような将来の spec を巻き込まない）。
 */
const CHROMIUM_ONLY_SPECS = [/visual-baseline/, /chart-fence-vr/, /a11y\.spec\.ts$/];

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI
    ? [["github"], ["./e2e/coverage-reporter.ts"]]
    : process.env.E2E_COVERAGE
      ? [["html"], ["./e2e/coverage-reporter.ts"]]
      : "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        // 環境により Playwright の pinned リビジョンとインストール済みブラウザが
        // ズレる場合の回避。PW_CHROMIUM_EXECUTABLE_PATH 設定時のみ指定ブラウザを
        // 使う（未設定なら Playwright 既定の解決動作）。VR 基準は本 seam 経由で
        // 生成している（詳細は e2e/visual-baseline.spec.ts のヘッダ参照）。
        ...(process.env.PW_CHROMIUM_EXECUTABLE_PATH
          ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_EXECUTABLE_PATH } }
          : {}),
      },
    },
    ...(process.env.CI
      ? [
          {
            name: "firefox",
            testIgnore: CHROMIUM_ONLY_SPECS,
            use: {
              browserName: "firefox" as const,
              launchOptions: {
                firefoxUserPrefs: {
                  "layers.acceleration.disabled": true,
                  "gfx.canvas.accelerated": false,
                  "gfx.webrender.all": false,
                  "media.hardware-video-decoding.enabled": false,
                },
              },
            },
          },
          {
            name: "webkit",
            testIgnore: CHROMIUM_ONLY_SPECS,
            use: { browserName: "webkit" as const },
          },
        ]
      : []),
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
