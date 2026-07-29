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
    injectedCss("ui/SideIconRail.ts"),
    injectedCss("ui/FilterPanel.ts"),
    injectedCss("ui/WordListPanel.ts"),
    injectedCss("ui/MinimapPanel.ts"),
    injectedCss("ui/ExportPanel.ts"),
  ].join("\n");

  // 取り出しが壊れていないことの確認。ここが空振りすると高さの検査が意味を失う。
  for (const selector of [
    ".cooc-viewer__panels",
    ".cooc-viewer__tabpanel",
    ".cooc-rail",
    ".cooc-rail__item",
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

/** アイコン列。表示順と操作名は仕様 §3.5 の表に一致させる（先頭が既定タブ）。 */
const TABS: ReadonlyArray<{ id: ActiveTab; label: string; panelId: string }> = [
  { id: "minimap", label: "ミニマップ", panelId: "cooc-panel-minimap" },
  { id: "filter", label: "絞り込み", panelId: "cooc-panel-filter" },
  { id: "edit", label: "編集", panelId: "cooc-panel-edit" },
  { id: "export", label: "保存", panelId: "cooc-panel-export" },
];

/**
 * 図の右端のアイコン列。
 *
 * 図柄そのものは寸法に効かないため、20px の矩形 1 つで代用する（列の幅・アイコンの寸法・
 * 縦の並びだけをここで測る）。
 */
function railHtml(activeTab: ActiveTab): string {
  return TABS.map(({ id, label, panelId }) => {
    const active = String(id === activeTab);
    return `<button class="cooc-btn cooc-rail__item" type="button" role="tab" aria-controls="${panelId}"`
      + ` aria-label="${label}" title="${label}" aria-selected="${active}" aria-expanded="${active}"`
      + ` data-active="${active}" tabindex="${id === activeTab ? 0 : -1}">`
      + `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">`
      + `<path d="M4 4h16v16H4z"></path></svg></button>`;
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
</aside>
<div class="cooc-rail" role="tablist" aria-orientation="vertical" aria-label="パネルの切り替え">${railHtml(activeTab)}</div>
</div></div></div></body></html>`;
}

interface PanelMetrics {
  viewportHeight: number;
  viewportScrolls: boolean;
  panelsScrolls: boolean;
  rowHeight: number;
  buttonsReachable: boolean;
  searchReachable: boolean;
  /** アイコン列の幅。 */
  railWidth: number;
  /** アイコン列がパネル列の内側にあるか（内側なら列のスクロールに巻き込まれる）。 */
  railInsidePanels: boolean;
  /** パネル列を最下部までスクロールした後の、アイコン列の上端。 */
  railTopAfterScroll: number;
  /** 同じ状態での先頭アイコンの上端。負なら画面の上へ流れている。 */
  railFirstItemTopAfterScroll: number;
  /** アイコン列に並んだアイコンの数。 */
  railCount: number;
  /** 全てのアイコンが同じ列にあるか（横へこぼれていないか）。 */
  railInOneColumn: boolean;
  /** 最後のアイコンまで画面の中に収まっているか。 */
  railFitsInViewport: boolean;
  /** アイコンボタンの一辺。潰れると押せる面積が失われる。 */
  railItemSize: number;
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
    const rail = document.querySelector(".cooc-rail") as HTMLElement;
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
      railWidth: Math.round(rail.getBoundingClientRect().width),
      ...(() => {
        // アイコン列はパネル列の外に立てる（仕様 §3.5）。中に置くと、絞り込みの内容が高い
        // ときに列と一緒に流れ、切り替えと開閉の手段そのものが視野から消える。
        //
        // Why not「画面のどこかにある」だけを見るか: 上へ流れて `top` が負になっても真に
        // なり、列をパネルの内側へ戻す退行を素通りさせる。包含関係と、パネル列を最下部まで
        // スクロールした後の位置を別々に返し、どちらが壊れたか失敗時に分かるようにする。
        panels.scrollTop = panels.scrollHeight;
        const rect = rail.getBoundingClientRect();
        const first = rail.querySelector<HTMLElement>(".cooc-rail__item")?.getBoundingClientRect();
        panels.scrollTop = 0;
        return {
          railInsidePanels: panels.contains(rail),
          railTopAfterScroll: Math.round(rect.top),
          railFirstItemTopAfterScroll: Math.round(first?.top ?? Number.NaN),
        };
      })(),
      ...(() => {
        const items = [...rail.querySelectorAll<HTMLElement>(".cooc-rail__item")];
        const rects = items.map((item) => item.getBoundingClientRect());
        const lefts = rects.map((rect) => Math.round(rect.left));
        return {
          railCount: items.length,
          railInOneColumn: lefts.every((left) => left === lefts[0]),
          railFitsInViewport: rects.every((rect) => rect.bottom <= window.innerHeight + 1),
          railItemSize: Math.round(rects[0]?.height ?? 0),
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

  test("絞り込みタブでは列がスクロールしない", async ({ page }) => {
    const metrics = await measure(page, 900, "filter");

    // 絞り込み欄だけなら列に収まる。
    expect(metrics.panelsScrolls).toBe(false);
  });

  test("既定のミニマップタブでは列がスクロールしない", async ({ page }) => {
    // 図を開いた直後に見える状態（仕様 §3.5 の既定タブ）。ミニマップは縦横比で高さが
    // 決まるため、列を溢れさせると操作ボタンが視野から出る。
    const metrics = await measure(page, 900, "minimap");

    expect(metrics.panelsScrolls).toBe(false);
    expect(metrics.railInOneColumn).toBe(true);
  });

  test("絞り込みタブで列が低くてもアイコン列が視野に残る", async ({ page }) => {
    const metrics = await measure(page, 320, "filter");

    // 絞り込み欄（クラスタ 5 件を含む）が列より高くなると列がスクロールする。その状態でも
    // アイコン列が視野から消えると、切り替えとパネルを開き直す手段が無くなる。
    expect(metrics.railInsidePanels).toBe(false);
    expect(metrics.railTopAfterScroll).toBeGreaterThanOrEqual(0);
    expect(metrics.railFirstItemTopAfterScroll).toBeGreaterThanOrEqual(0);
    // Why not 列の下端も画面内に収める条件を課すか: 列は `height:100%` で、行の高さが内容に
    // 引かれると画面より高くなりうる（実測で落ちた）。アイコンは列の上端から積むため、
    // 到達性に効くのは上端と個々のアイコンの位置である。全アイコンが画面に収まることは
    // 「画面が低くてもアイコンが潰れず全部見える」が別途測る。
  });

  test("画面が低くてもアイコンが潰れず全部見える", async ({ page }) => {
    const metrics = await measure(page, 320);

    // アイコンが縮むと押せる面積が失われ、列からはみ出すと下のアイコンへ到達できなくなる。
    expect(metrics.railItemSize).toBe(32);
    expect(metrics.railFitsInViewport).toBe(true);
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

  test("アイコン 4 つが縦 1 列に並ぶ", async ({ page }) => {
    const metrics = await measure(page, 900, "filter");

    // 図柄に置き換えたぶん、収まりの制約はラベル幅から列幅へ移った（仕様 §3.5）。
    expect(metrics.railCount).toBe(4);
    expect(metrics.railInOneColumn).toBe(true);
    expect(metrics.railWidth).toBe(46);
  });

  test("画面が狭くなってもアイコン列の幅は変わらない", async ({ page }) => {
    // パネル列は `max-width:40%` を持つため画面幅に追従して細くなる。アイコン列まで
    // 一緒に縮むと図柄が潰れる。列は縮まない側に置いた（`flex:0 0 auto`）。
    const metrics = await measure(page, 900, "filter", 640);

    expect(metrics.railWidth).toBe(46);
    expect(metrics.railInOneColumn).toBe(true);
  });

  test("行の高さが仮想リストの前提どおり 36px になる", async ({ page }) => {
    // 3 列目のクラスタ名が折り返すと隣接行へ重なる。省略指定が効いていることの実測。
    for (const height of [900, 420]) {
      const metrics = await measure(page, height);
      expect(metrics.rowHeight).toBe(ROW_HEIGHT);
    }
  });
});
