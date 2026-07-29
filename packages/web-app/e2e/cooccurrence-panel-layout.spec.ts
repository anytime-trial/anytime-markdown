import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

/**
 * 共起ビューア（packages/cooccurrence-viewer）の右サイドパネルが、実ブラウザで
 * 意図した高さ配分になるかを検査する。
 *
 * Why not jsdom（当該パッケージの jest）で済ませるか: jsdom はレイアウトを計算しないため、
 * 固定できるのは「どの CSS を書いたか」だけになる。実際、語一覧の内部スクロールが働かない
 * 不具合を 3 回続けて取り逃した（`flex:1` が `flex:1 1 0%` へ展開され、パーセンテージの
 * basis が親の高さ未確定により content ベースへフォールバックしていた）。宣言ロックは
 * 全て green のままだった。高さの検査は実ブラウザでしか成立しない。
 *
 * Why not web-app 以外に置くか: この repo で実ブラウザを回す配線は web-app の e2e だけで、
 * CI もここを起動する。専用パッケージを立てると依存と CI 配線の追加が要る。
 *
 * ビューアの mount は使わず、注入 CSS をソースから取り出して同じ DOM を組む。
 * 取り出しに失敗したら例外で落とす（無言で空の CSS を当てて全部 pass する事故を防ぐ）。
 */

const VIEWER_SRC = path.resolve(__dirname, "../../cooccurrence-viewer/src");

/** `ensureStyles()` のテンプレートリテラルから注入 CSS を取り出す。 */
function injectedCss(relativePath: string): string {
  const source = readFileSync(path.join(VIEWER_SRC, relativePath), "utf8");
  const anchor = source.indexOf("style.textContent =");
  if (anchor < 0) throw new Error(`style.textContent = が見つからない: ${relativePath}`);
  const open = source.indexOf("`", anchor);
  const close = source.indexOf("`", open + 1);
  if (open < 0 || close < 0) throw new Error(`テンプレートリテラルを取り出せない: ${relativePath}`);
  const css = source.slice(open + 1, close);
  if (css.includes("${")) throw new Error(`補間を含む CSS は再現できない: ${relativePath}`);
  return css;
}

function viewerCss(): string {
  const css = [
    injectedCss("ui/buttonBaseStyle.ts"),
    injectedCss("mountCooccurrenceViewer.ts"),
    injectedCss("ui/FilterPanel.ts"),
    injectedCss("ui/WordListPanel.ts"),
  ].join("\n");

  // 取り出しが壊れていないことの確認。ここが空振りすると高さの検査が意味を失う。
  for (const selector of [".cooc-viewer__panels", ".cooc-filter", ".cooc-words", ".cooc-words__viewport", ".cooc-words__row"]) {
    if (!css.includes(`${selector}{`)) throw new Error(`注入 CSS に ${selector} が含まれない`);
  }
  return css;
}

const ROW_HEIGHT = 36;
const WORD_COUNT = 36;

function pageHtml(): string {
  const rows = Array.from({ length: WORD_COUNT }, (_, index) => `<button class="cooc-btn cooc-btn--block cooc-words__row" type="button">`
    + `<span class="cooc-words__label">語 ${index}</span>`
    + `<span class="cooc-words__meta">${index + 1}</span>`
    + `<span class="cooc-words__meta">日本の半導体・AI関連株の下落</span>`
    + `</button>`).join("");
  const clusters = Array.from({ length: 5 }, (_, index) => `<label class="cooc-filter__check">`
    + `<input type="checkbox" checked><span class="cooc-filter__swatch" aria-hidden="true"></span>`
    + `<span>クラスタ ${index}</span></label>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body,#root{margin:0;padding:0;width:100%;height:100vh;overflow:hidden}
${viewerCss()}
</style></head><body><div id="root">
<div class="cooc-viewer"><div class="cooc-viewer__main">
<div class="cooc-viewer__stage"><canvas class="cooc-viewer__canvas"></canvas></div>
<aside class="cooc-viewer__panels">
 <section class="cooc-filter">
  <div class="cooc-filter__title">絞り込み</div>
  <label class="cooc-filter__field"><span>最小頻度</span><input type="number"></label>
  <div class="cooc-filter__clusters">${clusters}</div>
  <label class="cooc-filter__field"><span>最小共起強度</span><input type="number"></label>
  <label class="cooc-filter__field"><span>上位の共起</span><input type="number"></label>
  <div class="cooc-filter__counts"><div>36 / 36 語</div><div>51 / 51 共起</div></div>
 </section>
 <section class="cooc-words">
  <input class="cooc-words__search" placeholder="語を検索">
  <div class="cooc-words__viewport"><div class="cooc-words__spacer" style="height:${WORD_COUNT * ROW_HEIGHT}px">
   <div class="cooc-words__items">${rows}</div></div></div>
  <div class="cooc-words__edit"><input><input><select></select></div>
  <div class="cooc-words__buttons">
   <button class="cooc-btn cooc-words__button">追加</button>
   <button class="cooc-btn cooc-words__button">改名</button>
   <button class="cooc-btn cooc-words__button">頻度</button>
   <button class="cooc-btn cooc-words__button">クラスタ</button>
   <button class="cooc-btn cooc-words__button">削除</button></div>
  <div class="cooc-words__error"></div>
 </section>
</aside></div></div></div></body></html>`;
}

interface PanelMetrics {
  viewportHeight: number;
  viewportScrolls: boolean;
  panelsScrolls: boolean;
  rowHeight: number;
  buttonsReachable: boolean;
  searchReachable: boolean;
}

async function measure(page: import("@playwright/test").Page, height: number): Promise<PanelMetrics> {
  await page.setViewportSize({ width: 1200, height });
  await page.setContent(pageHtml());
  return page.evaluate(() => {
    const viewport = document.querySelector(".cooc-words__viewport") as HTMLElement;
    const panels = document.querySelector(".cooc-viewer__panels") as HTMLElement;
    const panelsRect = panels.getBoundingClientRect();
    // パネル列をスクロールし切れば見える位置にあるか。
    const reachable = (selector: string): boolean => {
      const element = document.querySelector(selector) as HTMLElement;
      const rect = element.getBoundingClientRect();
      return rect.bottom - panelsRect.top + panels.scrollTop <= panels.scrollHeight + 1;
    };
    return {
      viewportHeight: Math.round(viewport.getBoundingClientRect().height),
      viewportScrolls: viewport.scrollHeight > viewport.clientHeight,
      panelsScrolls: panels.scrollHeight > panels.clientHeight,
      rowHeight: Math.round((document.querySelector(".cooc-words__row") as HTMLElement).getBoundingClientRect().height),
      buttonsReachable: reachable(".cooc-words__buttons"),
      searchReachable: reachable(".cooc-words__search"),
    };
  });
}

test.describe("共起ビューアのパネル高さ配分", () => {
  test("語が多くても表の内部がスクロールし、列が引き伸ばされない", async ({ page }) => {
    const metrics = await measure(page, 900);

    expect(metrics.viewportScrolls).toBe(true);
    expect(metrics.panelsScrolls).toBe(false);
    // 全件ぶんの高さ（36 × 36 = 1296px）を viewport が抱え込んでいないこと。
    expect(metrics.viewportHeight).toBeLessThan(WORD_COUNT * ROW_HEIGHT);
    expect(metrics.viewportHeight).toBeGreaterThanOrEqual(120);
  });

  test("列が低くても表はスクロールし、下部の操作欄へ到達できる", async ({ page }) => {
    const metrics = await measure(page, 420);

    expect(metrics.viewportScrolls).toBe(true);
    expect(metrics.buttonsReachable).toBe(true);
    expect(metrics.searchReachable).toBe(true);
  });

  test("行の高さが仮想リストの前提どおり 36px になる", async ({ page }) => {
    // 3 列目のクラスタ名が折り返すと隣接行へ重なる。省略指定が効いていることの実測。
    for (const height of [900, 420]) {
      const metrics = await measure(page, height);
      expect(metrics.rowHeight).toBe(ROW_HEIGHT);
    }
  });
});
