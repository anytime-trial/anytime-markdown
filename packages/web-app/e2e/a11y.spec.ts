/**
 * axe による実行時アクセシビリティ検査（design.md 11.4「開発サイクルでの検証」の実行時検査層）。
 *
 * 走査対象ページを WCAG 2.x A / AA のルールで検査し、`a11y-baseline.json` に記録した
 * 「ページ × ルール → 既知の違反ノード数」と ratchet 方式で突き合わせる。
 *
 * - 基線を超えた違反（新規ルール・ノード数の増加）は失敗する。
 * - 減った分は `A11Y_UPDATE_BASELINE=1` で基線を縮めて記録する（縮む方向のみ）。
 * - 走査対象へページを足した時だけ `A11Y_BASELINE_SEED=1` で新ページの現状を取り込む。
 *   既存ページの許容を増やす入口は無い（手で書き換えない）。
 *
 * 実行: `npm run e2e:a11y -w @anytime-markdown/web-app`
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  type A11yBaseline,
  type A11yScanResult,
  formatRatchetReport,
  ratchetA11y,
  seedBaselineForNewPages,
} from "../src/a11y/ratchet";
import { localePath } from "./helpers";

/** 走査対象（ロケール無しのパス）。認証や外部データが必須なページは含めない */
const PAGES = [
  "/",
  "/markdown",
  "/docs/view",
  "/tickets",
  "/timeline",
  "/report",
  "/graph",
  "/diagram",
  "/cooccurrence",
  "/sheet",
  "/database",
  "/architecture",
  "/privacy",
] as const;

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const BASELINE_PATH = join(__dirname, "a11y-baseline.json");

function readBaseline(): A11yBaseline {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as A11yBaseline;
  } catch {
    return {};
  }
}

function writeBaseline(baseline: A11yBaseline): void {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
}

// 走査 → 判定の順序を固定するため、同一ワーカーで直列に走らせる
test.describe.configure({ mode: "serial" });

test.describe("a11y (axe ratchet)", () => {
  const scans: A11yScanResult[] = [];

  for (const path of PAGES) {
    test(`scan ${path}`, async ({ page }, testInfo) => {
      await page.goto(localePath(path));
      // hydration とデータ読込の完了を待つ（読込中は aria-busy が付く。11.3）。
      // 外部データに依存する領域（認証や API キーが無い環境では読込のまま）が残ることがあるため、
      // 一定時間で打ち切って走査し、残った読込領域の数を注記に残す。
      await page.locator("main, h1").first().waitFor({ state: "visible", timeout: 15_000 });
      await page
        .waitForFunction(() => document.querySelectorAll("[aria-busy='true']").length === 0, null, { timeout: 10_000 })
        .catch(() => undefined);
      const stillBusy = await page.locator("[aria-busy='true']").count();
      if (stillBusy > 0) testInfo.annotations.push({ type: "still-busy", description: `${stillBusy} region(s) still loading` });

      const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const violations = results.violations.map((v) => ({
        id: v.id,
        impact: v.impact ?? null,
        nodes: v.nodes.length,
      }));
      scans.push({ page: path, violations });

      await testInfo.attach(`axe-${path.replace(/\//g, "_") || "root"}.json`, {
        body: JSON.stringify(
          results.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            help: v.help,
            helpUrl: v.helpUrl,
            targets: v.nodes.map((n) => n.target.join(" ")),
          })),
          null,
          2,
        ),
        contentType: "application/json",
      });
    });
  }

  test("ratchet against baseline", () => {
    expect(scans.length, "走査結果が無い（scan テストが全て失敗した）").toBeGreaterThan(0);

    let baseline = readBaseline();
    if (process.env.A11Y_BASELINE_SEED) {
      baseline = seedBaselineForNewPages(baseline, scans);
      writeBaseline(baseline);
    }

    const result = ratchetA11y(baseline, scans);
    const report = formatRatchetReport(result);
    console.log(report);

    if (process.env.A11Y_UPDATE_BASELINE && result.improvements.length > 0) {
      writeBaseline(result.nextBaseline);
      console.log(`a11y baseline updated: ${BASELINE_PATH}`);
    }

    expect(result.ok, `${report}\n違反の詳細はレポートの添付 axe-*.json を参照`).toBe(true);
  });
});
