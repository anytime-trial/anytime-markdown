/**
 * 脱React の block chrome 用 vanilla ツールバー・プリミティブ（Phase 3 / ホスト隔離）。
 *
 * 各 overlay の vanilla chrome（gif / image / …）が共有する素 DOM 部品。テーマ色は
 * CSS 変数（`--am-color-*`・applyEditorThemeCssVars 注入）で追従し、React テーマ API
 * （useIsDark 等）に依存しない。アイコンは ui/icons と同一の Material SVG path を
 * currentColor で inline 描画する。
 */

import { svgIcon } from "@anytime-markdown/graph-core/ui-vanilla/dom";

// svgIcon は ui-vanilla/dom が唯一の定義元。既存 import 互換のため re-export する。
export { svgIcon } from "@anytime-markdown/graph-core/ui-vanilla/dom";

/** Material アイコン SVG path（24x24・ui/icons と同一）。warning のみ複数 path。 */
export const ICON = {
  drag: "M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2m-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2m0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2m6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2m0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2m0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2",
  edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z",
  delete: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6zM8 9h8v10H8zm7.5-5-1-1h-5l-1 1H5v2h14V4z",
  link: "M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1M8 13h8v-2H8zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5",
  annotate: "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2m0 14H6l-2 2V4h16z",
  warning: ["M12 5.99 19.53 19H4.47zM12 2 1 21h22z", "M13 16h-2v2h2zm0-6h-2v5h2z"],
  viewColumn: "M14.67 5v14H9.33V5zm1 14H21V5h-5.33zm-7.34 0V5H3v14z",
  tableRows: "M21 8H3V4h18zm0 2H3v4h18zm0 6H3v4h18z",
  alignLeft: "M15 15H3v2h12zm0-8H3v2h12zM3 13h18v-2H3zm0 8h18v-2H3zM3 3v2h18V3z",
  alignCenter: "M7 15v2h10v-2zm-4 6h18v-2H3zm0-8h18v-2H3zm4-6v2h10V7zM3 3v2h18V3z",
  alignRight: "M3 21h18v-2H3zm6-4h12v-2H9zm-6-4h18v-2H3zm6-4h12V7H9zM3 3v2h18V3z",
  moveUp: "M3 13c0-2.45 1.76-4.47 4.08-4.91l-1.49 1.5L7 11l4-4.01L7 3 5.59 4.41l1.58 1.58v.06C3.7 6.46 1 9.42 1 13c0 3.87 3.13 7 7 7h3v-2H8c-2.76 0-5-2.24-5-5m10 0v7h9v-7zm7 5h-5v-3h5zM13 4h9v7h-9z",
  moveDown: "M3 11c0 2.45 1.76 4.47 4.08 4.91l-1.49-1.49L7 13l4 4.01L7 21l-1.41-1.41 1.58-1.58v-.06C3.7 17.54 1 14.58 1 11c0-3.87 3.13-7 7-7h3v2H8c-2.76 0-5 2.24-5 5m19 0V4h-9v7zm-2-2h-5V6h5zm-7 4h9v7h-9z",
  fileDownload: "M19 9h-4V3H9v6H5l7 7zM5 18v2h14v-2z",
  image: "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2M8.5 13.5l2.5 3.01L14.5 12l4.5 6H5z",
  showChart: "m3.5 18.49 6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z",
} as const;

/**
 * ツールバーの外枠コンテナ（`data-block-toolbar` / role=toolbar / CSS 変数背景）。
 * ツールバー操作で editor の選択を失わないよう mousedown を抑止する。
 */
export function createToolbarContainer(ariaLabel: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-block-toolbar", "");
  el.setAttribute("role", "toolbar");
  el.setAttribute("aria-label", ariaLabel);
  // 背景は不透明（bg-paper）+ 枠線 + 影。ツールバーはブロック上側にフロート配置され
  // 直前ブロックに重なり得るため、半透明だと背後のテキストが透けて二重に見える。
  // 不透明にして「明確に手前のフローティングツールバー」として読めるようにする。
  el.style.cssText =
    "background-color:var(--am-color-bg-paper);padding:2px 6px;" +
    "display:flex;align-items:center;gap:2px;border-radius:4px;" +
    "border:1px solid var(--am-color-divider);" +
    "box-shadow:0 2px 8px rgba(0,0,0,0.18);";
  el.addEventListener("mousedown", (e) => e.preventDefault());
  return el;
}

/** ドラッグハンドル（`data-drag-handle`）。 */
export function mkDragHandle(label: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-drag-handle", "");
  el.setAttribute("role", "button");
  el.tabIndex = 0;
  el.setAttribute("aria-roledescription", "draggable item");
  el.setAttribute("aria-label", label);
  el.style.cssText =
    "display:inline-flex;align-items:center;cursor:grab;color:var(--am-color-text-secondary);";
  el.appendChild(svgIcon(ICON.drag));
  return el;
}

/** ブロック種別ラベル（"GIF" / "Image" など）。 */
export function mkLabel(text: string): HTMLSpanElement {
  const el = document.createElement("span");
  el.textContent = text;
  el.style.cssText =
    "font-weight:600;font-size:0.75rem;flex-shrink:0;color:var(--am-color-text-secondary);";
  return el;
}

export interface IconButtonOptions {
  /** アイコン右上に重ねるバッジ文字（"+" / "x" など）。 */
  badge?: string;
  /** バッジを error 色にする（削除系）。 */
  badgeError?: boolean;
  /** アイコンの回転角（度）。列移動など。 */
  rotate?: number;
}

/**
 * アイコンボタン。色は currentColor（既定 text-secondary）。`btn.style.color` で上書き可。
 * `opts.badge` / `opts.rotate` でバッジ・回転付きボタン（table の列行操作等）も作れる。
 */
export function mkIconButton(
  label: string,
  iconPath: string | readonly string[],
  onClick: () => void,
  opts: IconButtonOptions = {},
): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.setAttribute("aria-label", label);
  b.title = label;
  b.style.cssText =
    "display:inline-flex;align-items:center;justify-content:center;padding:2px;" +
    "border:none;background:transparent;cursor:pointer;border-radius:4px;" +
    "color:var(--am-color-text-secondary);";
  const icon = svgIcon(iconPath);
  if (opts.rotate) icon.style.transform = `rotate(${opts.rotate}deg)`;
  if (opts.badge) {
    const wrap = document.createElement("span");
    wrap.style.cssText = "position:relative;display:inline-flex;line-height:0;";
    wrap.appendChild(icon);
    const badge = document.createElement("span");
    badge.textContent = opts.badge;
    badge.style.cssText =
      "position:absolute;top:-4px;right:-4px;font-size:9px;font-weight:700;line-height:1;" +
      (opts.badgeError ? "color:var(--am-color-error-main);" : "color:var(--am-color-text-secondary);");
    wrap.appendChild(badge);
    b.appendChild(wrap);
  } else {
    b.appendChild(icon);
  }
  b.addEventListener("click", onClick);
  return b;
}

/** ToggleButtonGroup 相当のボタン群（枠付き）。 */
export function mkButtonGroup(...buttons: HTMLElement[]): HTMLElement {
  const g = document.createElement("div");
  g.style.cssText =
    "display:inline-flex;align-items:center;border:1px solid var(--am-color-divider);" +
    "border-radius:4px;overflow:hidden;";
  g.append(...buttons);
  return g;
}

/** 縦区切り線。 */
export function mkDivider(): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText =
    "width:1px;align-self:stretch;background-color:var(--am-color-divider);margin:0 2px;";
  return el;
}

/** 可変スペーサ（右寄せ用）。 */
export function mkSpacer(): HTMLElement {
  const el = document.createElement("div");
  el.style.flex = "1";
  return el;
}
