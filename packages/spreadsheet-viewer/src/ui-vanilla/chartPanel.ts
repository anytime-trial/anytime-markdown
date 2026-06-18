/**
 * chartPanel — `<anytime-chart>` を内包するフロートパネル。
 *
 * - ヘッダに種別切替 select（line/bar/scatter）と閉じるボタンを配置する
 * - ドラッグ移動可
 * - 色・余白は `--sv-*` トークン準拠（ダーク/ライト両対応）
 * - モードフラグ（isDark）は getter で都度評価（静的キャプチャ禁止）
 * - 状態スタイル（表示/非表示）はインライン style でなく data-* + スタイルシートで管理
 *
 * vanilla UI 規約: vanilla-ui-conventions.md に従う。
 */

import "@anytime-markdown/chart-core/element"; // <anytime-chart> WC 登録
import type { ChartKind } from "@anytime-markdown/chart-core";
import type { ChartSpec } from "@anytime-markdown/chart-core";

export interface ChartPanelOptions {
  /** 現在のテーマを返す getter（静的キャプチャ禁止）。 */
  isDark: () => boolean;
  /** 現在の ChartSpec を取得する getter。 */
  getSpec: () => ChartSpec | null;
  /** 初期チャート種別。 */
  kind: ChartKind;
  /** 種別変更コールバック。 */
  onKindChange: (kind: ChartKind) => void;
  /** 閉じるコールバック。 */
  onClose: () => void;
  /** 翻訳関数。 */
  t: (key: string) => string;
}

export interface ChartPanelHandle {
  el: HTMLDivElement;
  /** spec / テーマが変化したときに呼ぶ。 */
  update(): void;
  destroy(): void;
}

const PANEL_STYLE_ID = "sv-chart-panel-styles";
const PANEL_CSS = `
.sv-chart-panel {
  position: fixed;
  z-index: 1200;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-width: 320px;
  min-height: 240px;
  background: var(--sv-color-bg-paper);
  color: var(--sv-color-text-primary);
  border: 1px solid var(--sv-color-divider);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.20);
  resize: both;
  overflow: hidden;
}
.sv-chart-panel-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  background: var(--sv-color-bg-default);
  border-bottom: 1px solid var(--sv-color-divider);
  cursor: grab;
  user-select: none;
  flex-shrink: 0;
}
.sv-chart-panel-header[data-dragging="true"] { cursor: grabbing; }
.sv-chart-panel-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.sv-chart-panel anytime-chart {
  display: block;
  width: 100%;
  height: 100%;
}
`;

function ensureChartPanelStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(PANEL_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PANEL_STYLE_ID;
  style.textContent = PANEL_CSS;
  document.head.appendChild(style);
}

export function createChartPanel(options: ChartPanelOptions): ChartPanelHandle {
  ensureChartPanelStyles();

  const panel = document.createElement("div");
  panel.className = "sv-chart-panel";
  // 初期位置（画面右上寄り）
  panel.style.top = "80px";
  panel.style.right = "24px";
  panel.style.width = "480px";
  panel.style.height = "320px";

  /* ---- ヘッダ ---- */
  const header = document.createElement("div");
  header.className = "sv-chart-panel-header";

  // 種別切替 select
  const kindSelect = document.createElement("select");
  kindSelect.className = "sv-select";
  kindSelect.setAttribute("aria-label", options.t("chartCreate"));

  const kinds: ChartKind[] = ["line", "bar", "area", "pie", "scatter"];
  const kindKeys: Record<ChartKind, string> = {
    line: "chartKindLine",
    bar: "chartKindBar",
    area: "chartKindArea",
    pie: "chartKindPie",
    scatter: "chartKindScatter",
  };
  for (const k of kinds) {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = options.t(kindKeys[k]);
    if (k === options.kind) opt.selected = true;
    kindSelect.appendChild(opt);
  }
  kindSelect.addEventListener("change", () => {
    const next = kindSelect.value as ChartKind;
    options.onKindChange(next);
    applySpec();
  });

  // 閉じるボタン
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "sv-icon-btn sv-icon-btn--small";
  closeBtn.setAttribute("aria-label", options.t("chartClose"));
  closeBtn.style.marginLeft = "auto";
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", () => options.onClose());

  header.append(kindSelect, closeBtn);

  /* ---- body（<anytime-chart> WC） ---- */
  const body = document.createElement("div");
  body.className = "sv-chart-panel-body";

  // jsdom では customElements が無い場合を考慮（SSR 安全）
  let chartEl: HTMLElement | null = null;
  if (typeof customElements !== "undefined") {
    chartEl = document.createElement("anytime-chart");
    chartEl.setAttribute("theme", options.isDark() ? "dark" : "light");
    body.appendChild(chartEl);
  }

  panel.append(header, body);

  /* ---- spec 適用 ---- */
  const applySpec = (): void => {
    if (!chartEl) return;
    const spec = options.getSpec();
    if (spec) {
      // theme は都度評価（getter 経由）
      chartEl.setAttribute("theme", options.isDark() ? "dark" : "light");
      (chartEl as unknown as { spec: ChartSpec }).spec = spec;
    }
  };
  applySpec();

  /* ---- ドラッグ移動 ---- */
  let dragStartX = 0;
  let dragStartY = 0;
  let panelStartTop = 0;
  let panelStartLeft = 0;
  let isDragging = false;

  const onPointerMove = (e: PointerEvent): void => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    panel.style.top = `${panelStartTop + dy}px`;
    panel.style.left = `${panelStartLeft + dx}px`;
    panel.style.right = "auto";
  };

  const onPointerUp = (): void => {
    isDragging = false;
    header.removeAttribute("data-dragging");
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
  };

  header.addEventListener("pointerdown", (e) => {
    // select / button クリックはドラッグ除外
    if (e.target === kindSelect || e.target === closeBtn) return;
    isDragging = true;
    header.setAttribute("data-dragging", "true");
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    const rect = panel.getBoundingClientRect();
    panelStartTop = rect.top;
    panelStartLeft = rect.left;
    panel.style.right = "auto";
    panel.style.left = `${panelStartLeft}px`;
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  });

  return {
    el: panel,

    update() {
      applySpec();
      if (chartEl) {
        chartEl.setAttribute("theme", options.isDark() ? "dark" : "light");
      }
    },

    destroy() {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      panel.remove();
    },
  };
}
