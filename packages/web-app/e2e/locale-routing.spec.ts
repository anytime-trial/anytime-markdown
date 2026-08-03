import { test, expect } from "./coverage.fixture";

import { localePath } from "./helpers";

/**
 * ロケールが **URL で決まる**ことを直接検証する。
 *
 * 背景: ロケールを URL で決定し英語を `/en` 配下へ分離した際、`e2e/` は更新されなかった。
 * 各 spec がプレフィックス無しのパスを直書きしたまま英語のアクセシブル名を期待していたため、
 * 67 件が同時に落ちた（2026-08-03 実測）。個々の spec は `localePath()` を通すことで
 * 対象ロケールを明示するが、それだけでは「ロケール分離そのものが壊れた」ことを検知できない。
 * 本 spec がその検知を担う。
 *
 * 期待する配線（`src/i18n/routing.ts`）: locales = ['ja', 'en'] / defaultLocale = 'ja' /
 * localePrefix = 'as-needed' → ja はプレフィックス無し、en は `/en` 配下。
 */
test.describe("Locale routing", () => {
  test("プレフィックス無しのパスは既定ロケール（ja）の UI を返す", async ({ page }) => {
    await page.goto("/markdown");
    await page.locator(".tiptap").waitFor({ state: "visible" });
    await expect(page.getByRole("toolbar", { name: "エディタツールバー" })).toBeVisible();
    await expect(page.getByRole("toolbar", { name: "Editor toolbar" })).toHaveCount(0);
  });

  test("/en 配下のパスは英語 UI を返す", async ({ page }) => {
    await page.goto("/en/markdown");
    await page.locator(".tiptap").waitFor({ state: "visible" });
    await expect(page.getByRole("toolbar", { name: "Editor toolbar" })).toBeVisible();
    await expect(page.getByRole("toolbar", { name: "エディタツールバー" })).toHaveCount(0);
  });

  test("localePath() が spec の対象ロケールを URL へ反映する", async ({ page }) => {
    // 既定（E2E_LOCALE 未設定）では en を指すこと。ここが ja に倒れると、
    // 英語名を前提にした全 spec が一斉に落ちる形の退行になる。
    expect(localePath("/markdown", "en")).toBe("/en/markdown");
    expect(localePath("/markdown", "ja")).toBe("/markdown");
    expect(localePath("/", "en")).toBe("/en");
    expect(localePath("/", "ja")).toBe("/");

    // 実際に解決した URL が英語 UI へ到達すること（文字列だけの検証にしない）
    await page.goto(localePath("/markdown", "en"));
    await page.locator(".tiptap").waitFor({ state: "visible" });
    await expect(page.getByRole("toolbar", { name: "Editor toolbar" })).toBeVisible();
  });
});
