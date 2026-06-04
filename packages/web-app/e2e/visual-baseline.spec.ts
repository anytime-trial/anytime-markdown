import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * MUI 削減（Phase3a）の視覚回帰(VR)基準。
 * chrome（ツールバー・設定ドロワー・スラッシュメニュー）を
 * 2 テーマ(light/dark) × 2 プリセット(handwritten/professional) で固定する。
 *
 * 各スライス（T1 レイアウト / T2 ボタン / T6 オーバーレイ …）の置換前後で
 * `npm run e2e -- visual-baseline` を実行し、差分ゼロを移行の中立性ゲートとする。
 *
 * 基準画像は Linux + chromium で生成したもの。環境が変わると AA 差で再生成が必要。
 *
 * 生成・実行コマンド（この環境では Playwright の pinned リビジョンとインストール済み
 * ブラウザがズレているため、`PW_CHROMIUM_EXECUTABLE_PATH` でフル chromium を指定する）:
 *   PW_CHROMIUM_EXECUTABLE_PATH="$HOME/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome" \
 *     npx playwright test visual-baseline --project=chromium [--update-snapshots]
 * この seam は `playwright.config.ts` の chromium project に実装。未設定なら既定動作。
 */

const CONTENT_KEY = "markdown-editor-content";
const MODE_KEY = "anytime-markdown-theme-mode";
const PRESET_KEY = "anytime-markdown-theme-preset";

const MODES = ["light", "dark"] as const;
const PRESETS = ["handwritten", "professional"] as const;

const SHOT = {
  animations: "disabled",
  caret: "hide",
  // 小要素の AA 差を吸収しつつ chrome の実変更は捕捉する小さな許容。
  maxDiffPixelRatio: 0.01,
} as const;

async function openChrome(
  page: Page,
  mode: (typeof MODES)[number],
  preset: (typeof PRESETS)[number],
): Promise<void> {
  await page.addInitScript(
    ({ contentKey, modeKey, presetKey, modeVal, presetVal }) => {
      localStorage.setItem(contentKey, "");
      localStorage.setItem(modeKey, modeVal);
      localStorage.setItem(presetKey, presetVal);
    },
    { contentKey: CONTENT_KEY, modeKey: MODE_KEY, presetKey: PRESET_KEY, modeVal: mode, presetVal: preset },
  );
  await page.goto("/markdown");
  await page.locator(".tiptap").waitFor({ state: "visible" });
  const editBtn = page.getByRole("button", { name: /^edit$/i });
  if (await editBtn.isVisible()) {
    await editBtn.click();
  }
  // フォント読み込みと 2 フレーム分の描画を待ち、テーマ CSS 変数の適用を確定させる。
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );
}

for (const mode of MODES) {
  for (const preset of PRESETS) {
    test.describe(`VR ${mode} / ${preset}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 720 });
        await openChrome(page, mode, preset);
      });

      test("toolbar", async ({ page }) => {
        const toolbar = page.getByRole("toolbar", { name: "Editor toolbar" });
        await expect(toolbar).toBeVisible();
        await expect(toolbar).toHaveScreenshot(`toolbar-${mode}-${preset}.png`, SHOT);
      });

      test("settings drawer", async ({ page }) => {
        await page.getByRole("button", { name: "Editor Settings" }).click();
        await expect(page.locator("#settings-panel-title")).toBeVisible({ timeout: 10_000 });
        const drawer = page.locator('[aria-labelledby="settings-panel-title"]');
        await expect(drawer).toHaveScreenshot(`settings-drawer-${mode}-${preset}.png`, SHOT);
      });

      test("slash menu", async ({ page }) => {
        await page.locator(".tiptap").click();
        await page.keyboard.type("/");
        const menu = page.getByRole("menu", { name: "Type to filter..." });
        await expect(menu).toBeVisible();
        await expect(menu).toHaveScreenshot(`slash-menu-${mode}-${preset}.png`, SHOT);
      });
    });
  }
}
