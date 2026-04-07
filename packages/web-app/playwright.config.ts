import { defineConfig } from "@playwright/test";

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
      use: { browserName: "chromium" },
    },
    ...(process.env.CI
      ? [
          {
            name: "firefox",
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
