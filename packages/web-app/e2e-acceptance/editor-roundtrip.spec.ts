import { expect, test } from "@playwright/test";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * 受入ファーム S1 初回フロー: markdown-viewer standalone の「編集 → 保存 → 再読込」往復一致 + VRT。
 * ハーネス（file://）は packages/markdown-viewer/e2e-harness/index.html。
 * 事前に markdown-viewer の build（dist/anytime-markdown-editor.iife.js）が必要 — farm ランナーが担う。
 */

const HARNESS_URL = pathToFileURL(
  path.resolve(__dirname, "../../markdown-viewer/e2e-harness/index.html"),
).href;

const FIXTURE = [
  "# 受入ファーム往復フィクスチャ",
  "",
  "編集 → 保存 → 再読込の一致を確認する段落です。",
  "",
  "- 項目 1",
  "- 項目 2",
  "",
].join("\n");

declare global {
  interface Window {
    __harnessReady?: boolean;
    __harness?: { setValue(md: string): void; getValue(): string };
  }
}

async function openHarness(page: import("@playwright/test").Page, theme: "light" | "dark"): Promise<void> {
  await page.goto(`${HARNESS_URL}?theme=${theme}`);
  await page.waitForFunction(() => window.__harnessReady === true);
  await page.evaluate((md) => window.__harness?.setValue(md), FIXTURE);
  await expect(page.locator('[contenteditable="true"]').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

for (const theme of ["light", "dark"] as const) {
  test(`編集 → 保存 → 再読込で本文が一致する (${theme})`, async ({ page }) => {
    await openHarness(page, theme);

    // 編集: 段落末尾へ追記し、value（保存相当のシリアライズ結果）に反映されること
    await page.locator('[contenteditable="true"]').first().click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("追記テキスト");
    const edited = await page.evaluate(() => window.__harness?.getValue() ?? "");
    expect(edited).toContain("追記テキスト");
    expect(edited).toContain("# 受入ファーム往復フィクスチャ");

    // 再読込 → 保存済み Markdown を流し込み → 再シリアライズが一致（往復一致）
    await page.reload();
    await page.waitForFunction(() => window.__harnessReady === true);
    await page.evaluate((md) => window.__harness?.setValue(md), edited);
    await expect(page.locator('[contenteditable="true"]').first()).toBeVisible();
    const roundtripped = await page.evaluate(() => window.__harness?.getValue() ?? "");
    expect(roundtripped).toBe(edited);
  });

  test(`初期表示の視覚回帰 (${theme})`, async ({ page }) => {
    await openHarness(page, theme);
    await expect(page).toHaveScreenshot(`editor-initial-${theme}.png`);
  });
}
