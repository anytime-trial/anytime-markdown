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
    injectedCss("ui/TabBar.ts"),
    injectedCss("ui/FilterPanel.ts"),
    injectedCss("ui/WordListPanel.ts"),
    injectedCss("ui/MinimapPanel.ts"),
    injectedCss("ui/ExportPanel.ts"),
  ].join("\n");

  // 取り出しが壊れていないことの確認。ここが空振りすると高さの検査が意味を失う。
  for (const selector of [
    ".cooc-viewer__panels",
    ".cooc-viewer__tabpanel",
    ".cooc-tabs",
    ".cooc-tabs__tab",
    ".cooc-filter",
    ".cooc-words",
    ".cooc-words__viewport",
    ".cooc-words__row",
    ".cooc-minimap",
    ".cooc-minimap__frame",
    ".cooc-export",
  ]) {
    if (!css.includes(`${selector}{`)) throw new Error(`注入 CSS に ${selector} が含まれない`);
  }
  return css;
}

const ROW_HEIGHT = 36;
const WORD_COUNT = 36;

type ActiveTab = "filter" | "edit" | "minimap" | "export";

/** タブ列。表示順とラベルは仕様 §3.5 の表に一致させる。 */
const TABS: ReadonlyArray<{ id: ActiveTab; label: string; panelId: string }> = [
  { id: "filter", label: "絞り込み", panelId: "cooc-panel-filter" },
  { id: "edit", label: "編集", panelId: "cooc-panel-edit" },
  { id: "minimap", label: "ミニマップ", panelId: "cooc-panel-minimap" },
  { id: "export", label: "保存", panelId: "cooc-panel-export" },
];

function tabsHtml(activeTab: ActiveTab): string {
  return TABS.map(({ id, label, panelId }) => {
    const active = String(id === activeTab);
    return `<button class="cooc-btn cooc-tabs__tab" type="button" role="tab" aria-controls="${panelId}"`
      + ` aria-selected="${active}" data-active="${active}" tabindex="${id === activeTab ? 0 : -1}">${label}</button>`;
  }).join("");
}

function pageHtml(activeTab: ActiveTab): string {
  const rows = Array.from({ length: WORD_COUNT }, (_, index) => `<button class="cooc-btn cooc-btn--block cooc-words__row" type="button">`
    + `<span class="cooc-words__label">語 ${index}</span>`
    + `<span class="cooc-words__meta">${index + 1}</span>`
    + `<span class="cooc-words__meta">日本の半導体・AI関連株の下落</span>`
    + `</button>`).join("");
  const clusters = Array.from({ length: 5 }, (_, index) => `<label class="cooc-filter__check">`
    + `<input type="checkbox" checked><span class="cooc-filter__swatch" aria-hidden="true"></span>`
    + `<span>クラスタ ${index}</span></label>`).join("");

  // 既定では絞り込みタブ、切り替えると編集タブが開く（仕様 §3.5）。両方の状態を測る。
  const hiddenUnless = (id: ActiveTab): string => (activeTab === id ? "" : " hidden");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body,#root{margin:0;padding:0;width:100%;height:100vh;overflow:hidden}
${viewerCss()}
</style></head><body><div id="root">
<div class="cooc-viewer"><div class="cooc-viewer__main">
<div class="cooc-viewer__stage"><canvas class="cooc-viewer__canvas"></canvas></div>
<aside class="cooc-viewer__panels">
 <div class="cooc-tabs" role="tablist">${tabsHtml(activeTab)}</div>
 <div class="cooc-viewer__tabpanel" id="cooc-panel-filter" role="tabpanel"${hiddenUnless("filter")}>
  <section class="cooc-filter">
   <div class="cooc-filter__title">絞り込み</div>
   <label class="cooc-filter__field"><span>最小頻度</span><input type="number"></label>
   <div class="cooc-filter__clusters">${clusters}</div>
   <label class="cooc-filter__field"><span>最小共起強度</span><input type="number"></label>
   <label class="cooc-filter__field"><span>上位の共起</span><input type="number"></label>
   <div class="cooc-filter__counts"><div>36 / 36 語</div><div>51 / 51 共起</div></div>
  </section>
 </div>
 <div class="cooc-viewer__tabpanel" id="cooc-panel-edit" role="tabpanel"${hiddenUnless("edit")}>
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
 </div>
 <div class="cooc-viewer__tabpanel" id="cooc-panel-minimap" role="tabpanel"${hiddenUnless("minimap")}>
  <section class="cooc-minimap">
   <div class="cooc-minimap__frame"><canvas class="cooc-minimap__canvas" role="application" tabindex="0"></canvas></div>
   <div class="cooc-minimap__buttons">
    <button class="cooc-btn cooc-minimap__button" data-action="zoom-in"></button>
    <button class="cooc-btn cooc-minimap__button" data-action="zoom-out"></button>
    <button class="cooc-btn cooc-minimap__button" data-action="fit"></button></div>
   <div class="cooc-minimap__hint">クリック・ドラッグ・矢印キーで表示位置を移動</div>
  </section>
 </div>
 <div class="cooc-viewer__tabpanel" id="cooc-panel-export" role="tabpanel"${hiddenUnless("export")}>
  <section class="cooc-export">
   <div class="cooc-export__buttons">
    <button class="cooc-btn cooc-export__button" data-action="save">保存</button>
    <button class="cooc-btn cooc-export__button" data-action="export-png">PNG</button></div>
   <div class="cooc-export__note"></div>
  </section>
 </div>
</aside></div></div></div></body></html>`;
}

interface PanelMetrics {
  viewportHeight: number;
  viewportScrolls: boolean;
  panelsScrolls: boolean;
  rowHeight: number;
  buttonsReachable: boolean;
  searchReachable: boolean;
  tabsHeight: number;
  /** パネル列を最下部までスクロールしても、タブ列が可視領域に残っているか。 */
  tabsStayVisible: boolean;
  /** タブ列に並んだタブの数。 */
  tabCount: number;
  /** 全てのタブが同じ行にあるか（折り返していないか）。 */
  tabsOnOneLine: boolean;
  /** どのタブもラベルが 1 行に収まっているか（ボタンの中で折り返していないか）。 */
  tabLabelsFit: boolean;
}

async function measure(
  page: import("@playwright/test").Page,
  height: number,
  activeTab: ActiveTab = "edit",
  /** 画面幅。パネル列は `width:300px; max-width:40%` なので、狭い画面では列も狭くなる。 */
  width = 1200,
): Promise<PanelMetrics> {
  await page.setViewportSize({ width, height });
  await page.setContent(pageHtml(activeTab));
  return page.evaluate(() => {
    const viewport = document.querySelector(".cooc-words__viewport") as HTMLElement;
    const panels = document.querySelector(".cooc-viewer__panels") as HTMLElement;
    const tabs = document.querySelector(".cooc-tabs") as HTMLElement;
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
      tabsHeight: Math.round(tabs.getBoundingClientRect().height),
      tabsStayVisible: (() => {
        // 列がスクロールする状況でタブ列が上へ流れると、切り替え手段そのものが視野から消える。
        panels.scrollTop = panels.scrollHeight;
        const stays = tabs.getBoundingClientRect().bottom > panels.getBoundingClientRect().top;
        panels.scrollTop = 0;
        return stays;
      })(),
      ...(() => {
        const tabButtons = [...tabs.querySelectorAll<HTMLElement>(".cooc-tabs__tab")];
        const tops = tabButtons.map((tab) => Math.round(tab.getBoundingClientRect().top));
        // ラベルの行数を測る。ボタンの高さは内容に追従して伸びるため、`scrollHeight` や
        // `scrollWidth` との比較では折り返しを検知できない（実測で確認済み）。
        const lineCount = (tab: HTMLElement): number => {
          const range = document.createRange();
          range.selectNodeContents(tab);
          return range.getClientRects().length;
        };
        return {
          tabCount: tabButtons.length,
          tabsOnOneLine: tops.every((top) => top === tops[0]),
          tabLabelsFit: tabButtons.every((tab) => lineCount(tab) <= 1),
        };
      })(),
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

  test("編集タブでは一覧が縦積みのときより高い領域を得る", async ({ page }) => {
    const metrics = await measure(page, 900);

    // 縦積みの構成では絞り込み欄（クラスタ 5 件を含む）が列の上半分を占め、一覧の
    // viewport は 400px 前後で頭打ちだった。タブで分けた効果を下限として固定する。
    expect(metrics.viewportHeight).toBeGreaterThan(600);
    // ただし全件ぶん（36 × 36 = 1296px）を抱え込んで内部スクロールを失ってはいけない。
    expect(metrics.viewportScrolls).toBe(true);
    expect(metrics.panelsScrolls).toBe(false);
  });

  test("既定の絞り込みタブでは列がスクロールしない", async ({ page }) => {
    const metrics = await measure(page, 900, "filter");

    // 図を開いた直後に見える状態（仕様 §3.5 の既定タブ）。絞り込み欄だけなら列に収まる。
    expect(metrics.panelsScrolls).toBe(false);
    expect(metrics.tabsHeight).toBeGreaterThanOrEqual(28);
  });

  test("絞り込みタブで列が低くてもタブ見出しへ到達できる", async ({ page }) => {
    const metrics = await measure(page, 320, "filter");

    // 絞り込み欄（クラスタ 5 件を含む）が列より高くなると列がスクロールする。その状態でも
    // タブ列が視野から消えると、編集タブへ戻る手段が無くなる。
    expect(metrics.tabsStayVisible).toBe(true);
  });

  test("列が低くてもタブ見出しが潰れない", async ({ page }) => {
    const metrics = await measure(page, 320);

    // タブ列が縮むと、パネルを切り替える手段そのものへ到達できなくなる。
    // 内容（12px の文字 + 上下 6px の余白）が収まる高さを下限として固定する。
    expect(metrics.tabsHeight).toBeGreaterThanOrEqual(28);
    expect(metrics.searchReachable).toBe(true);
  });

  test("隠れているタブが列の高さを取らない", async ({ page }) => {
    await measure(page, 900);

    const hiddenHeight = await page.evaluate(() => {
      const filterPanel = document.querySelector("#cooc-panel-filter") as HTMLElement;
      return filterPanel.getBoundingClientRect().height;
    });

    // hidden 属性だけでは display:flex が勝ち、隠したはずの絞り込み欄が列の高さを取り続ける。
    expect(hiddenHeight).toBe(0);
  });

  test("タブ 4 枚が 1 行に収まる", async ({ page }) => {
    const metrics = await measure(page, 900, "filter");

    // パネル幅 300px にタブ 4 枚を並べる（仕様 §3.5）。折り返すと、選択中のタブの内容が
    // 得られる高さがそのぶん減る。ラベルを短くしたのはこの制約のためであり、
    // 実ブラウザで測らなければ判断の根拠そのものが検証されない。
    expect(metrics.tabCount).toBe(4);
    expect(metrics.tabsOnOneLine).toBe(true);
    expect(metrics.tabLabelsFit).toBe(true);
    // 1 行ぶん（12px の文字 + 上下 6px の余白 + 上の余白 8px）を超えていないこと。
    expect(metrics.tabsHeight).toBeLessThan(48);
  });

  test("列が狭くなってもタブ 4 枚が 1 行に収まる", async ({ page }) => {
    // パネル列は `max-width:40%` を持つ。画面が狭いと 300px より細くなり、タブ列は
    // ここが最も厳しい。ラベルを短くした判断が効いているかはこの条件で決まる。
    const metrics = await measure(page, 900, "filter", 640);

    expect(metrics.tabsOnOneLine).toBe(true);
    expect(metrics.tabLabelsFit).toBe(true);
  });

  test("ミニマップタブでも列がスクロールしない", async ({ page }) => {
    const metrics = await measure(page, 900, "minimap");

    // ミニマップは縦横比で高さが決まる。列を溢れさせると操作ボタンが視野から出る。
    expect(metrics.panelsScrolls).toBe(false);
    expect(metrics.tabsOnOneLine).toBe(true);
  });

  test("行の高さが仮想リストの前提どおり 36px になる", async ({ page }) => {
    // 3 列目のクラスタ名が折り返すと隣接行へ重なる。省略指定が効いていることの実測。
    for (const height of [900, 420]) {
      const metrics = await measure(page, height);
      expect(metrics.rowHeight).toBe(ROW_HEIGHT);
    }
  });
});
