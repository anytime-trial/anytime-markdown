import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * 受入ファーム S2: 印刷 PDF の画素比較（要件書 §6）。
 *
 * `page.pdf()`（headless Chromium・印刷 CSS 適用）を pdftoppm で PNG にラスタライズし、
 * Playwright の画像コンパレータ（toMatchSnapshot）で基準比較する。
 * PDF バイト列は CreationDate 等で毎回変わるため比較せず、比較対象はラスタ画素のみ。
 * PDF 自体は test-results に artifact として残す（差分調査用）。
 */

const HARNESS_URL = pathToFileURL(
  path.resolve(__dirname, "../../markdown-viewer/e2e-harness/index.html"),
).href;

const FIXTURE = [
  "# 印刷フィクスチャ",
  "",
  "印刷 CSS（@media print）の回帰を検証する段落です。",
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

for (const theme of ["light", "dark"] as const) {
  // @vrt タグは farm の vrtDiff 判定・VLM 前処理の起動契約（editor-roundtrip.spec.ts と同一）
  test(`印刷 PDF の画素回帰 (${theme})`, { tag: "@vrt" }, async ({ page }, testInfo) => {
    await page.goto(`${HARNESS_URL}?theme=${theme}`);
    await page.waitForFunction(() => window.__harnessReady === true);
    await page.evaluate((md) => window.__harness?.setValue(md), FIXTURE);
    await expect(page.locator('[contenteditable="true"]').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));

    const pdf = await page.pdf({ format: "A4", printBackground: true });
    const pdfPath = testInfo.outputPath(`print-${theme}.pdf`);
    fs.writeFileSync(pdfPath, pdf);

    // -r 72: 低解像度で十分（レイアウト崩れ検知が目的。ファイルサイズと比較コストを抑える）。
    // 出力は testInfo.outputPath 配下（Playwright が管理・クリーンする領域）に置き、os.tmpdir を汚さない。
    // pdftoppm は OS の poppler-utils 依存（Dockerfile に導入済み。欠落時は ENOENT で fail-visible）
    const ppmPrefix = testInfo.outputPath(`print-${theme}-page`);
    execFileSync("pdftoppm", ["-png", "-r", "72", "-f", "1", "-l", "1", pdfPath, ppmPrefix]);
    const pngPath = `${ppmPrefix}-1.png`;
    expect(fs.existsSync(pngPath)).toBe(true);

    expect(fs.readFileSync(pngPath)).toMatchSnapshot(`print-page1-${theme}.png`);
  });
}
