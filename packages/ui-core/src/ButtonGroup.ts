/**
 * 脱React の vanilla DOM ファクトリ — ButtonGroup（MUI ButtonGroup / `trail-viewer/src/ui/ButtonGroup.tsx` 置換）。
 *
 * 複数ボタンを連結したグループコンテナ（`<div role="group">`）。
 * `orientation` で水平 / 垂直を切り替え、`fullWidth` で親幅いっぱいに広げる。
 * 子は `VanillaContent`（string / Node / 配列）で受け取り `appendContent` で流し込む。
 * `sx` は受理しない（ui-core 方針）。
 */

import { appendContent, applyStyle, ensureStyle, type VanillaContent } from "./dom";

const BUTTON_GROUP_STYLE_ID = "am-ui-button-group-styles";

/** ButtonGroup の連結ボーダー CSS を 1 度だけ注入する。 */
function ensureButtonGroupStyles(): void {
  ensureStyle(
    BUTTON_GROUP_STYLE_ID,
    ".am-button-group{display:inline-flex;}" +
      ".am-button-group--vertical{flex-direction:column;}" +
      ".am-button-group--full-width{display:flex;width:100%;}" +
      ".am-button-group > *{flex:1 1 auto;}" +
      ".am-button-group:not(.am-button-group--vertical) > *:not(:first-child){margin-left:-1px;}" +
      ".am-button-group.am-button-group--vertical > *:not(:first-child){margin-top:-1px;}",
  );
}

/** {@link createButtonGroup} のオプション。`trail-viewer/src/ui/ButtonGroup.tsx` の ButtonGroupProps 対応範囲。 */
export interface CreateButtonGroupOptions {
  /** 並び方向（既定 "horizontal"）。 */
  orientation?: "horizontal" | "vertical";
  /** 親幅いっぱいに広げる（既定 false）。 */
  fullWidth?: boolean;
  /** グループ内のボタン群（string / Node / その配列）。 */
  children?: VanillaContent;
  /** 追加クラス名。 */
  className?: string;
  /** role 属性（既定 "group"）。 */
  role?: string;
  /** aria-label。 */
  ariaLabel?: string;
  /** data-testid 属性。 */
  testId?: string;
  /** 追加スタイル（cssText の後に上書き）。 */
  style?: Partial<CSSStyleDeclaration>;
}

/**
 * MUI ButtonGroup 相当の最小 vanilla 版（`trail-viewer/src/ui/ButtonGroup.tsx` 置換）。
 *
 * `<div role="group">` にボタンを横（または縦）並びで連結する。
 * static content + イベント登録なしのため update / destroy は提供しない。
 */
export function createButtonGroup(opts: CreateButtonGroupOptions = {}): { el: HTMLDivElement } {
  ensureButtonGroupStyles();

  const el = document.createElement("div");
  el.setAttribute("role", opts.role ?? "group");

  const orientation = opts.orientation ?? "horizontal";
  const classes = [
    "am-button-group",
    orientation === "vertical" ? "am-button-group--vertical" : "",
    opts.fullWidth ? "am-button-group--full-width" : "",
    opts.className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  el.className = classes;

  if (opts.ariaLabel) el.setAttribute("aria-label", opts.ariaLabel);
  if (opts.testId) el.setAttribute("data-testid", opts.testId);

  applyStyle(el, opts.style);
  appendContent(el, opts.children);

  return { el };
}
