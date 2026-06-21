/**
 * 脱React の vanilla DOM ファクトリ — Toolbar（MUI Toolbar / `trail-viewer/src/ui/Toolbar.tsx` 置換）。
 *
 * 水平 flex コンテナ（`<div>`）。`variant` で "regular"（高さ 56px）/ "dense"（高さ 40px）を
 * 切り替え、`disableGutters` でデフォルトの左右パディングを除去できる。
 * 子は `VanillaContent`（string / Node / 配列）で受け取り `appendContent` で流し込む。
 * `sx` は受理しない（ui-core 方針）。
 */

import { appendContent, applyStyle, ensureStyle, type VanillaContent } from "./dom";

const TOOLBAR_STYLE_ID = "am-ui-toolbar-styles";

/** Toolbar の共有 CSS を 1 度だけ注入する。 */
function ensureToolbarStyles(): void {
  ensureStyle(
    TOOLBAR_STYLE_ID,
    ".am-toolbar{display:flex;align-items:center;min-height:56px;padding-left:16px;padding-right:16px;}" +
      ".am-toolbar--dense{min-height:40px;}" +
      ".am-toolbar--no-gutters{padding-left:0;padding-right:0;}",
  );
}

/** {@link createToolbar} のオプション。`trail-viewer/src/ui/Toolbar.tsx` の ToolbarProps 対応範囲。 */
export interface CreateToolbarOptions {
  /** 高さバリアント（既定 "regular" = 56px、"dense" = 40px）。 */
  variant?: "regular" | "dense";
  /** true のとき左右パディングを除去する。 */
  disableGutters?: boolean;
  /** ツールバー内のコンテンツ（string / Node / その配列）。 */
  children?: VanillaContent;
  /** 追加クラス名。 */
  className?: string;
  /** role 属性。 */
  role?: string;
  /** aria-label。 */
  ariaLabel?: string;
  /** data-testid 属性。 */
  testId?: string;
  /** 追加スタイル（cssText の後に上書き）。 */
  style?: Partial<CSSStyleDeclaration>;
}

/**
 * MUI Toolbar 相当の最小 vanilla 版（`trail-viewer/src/ui/Toolbar.tsx` 置換）。
 *
 * 水平 flex コンテナ（`<div>`）。static content + イベント登録なしのため
 * update / destroy は提供しない。
 */
export function createToolbar(opts: CreateToolbarOptions = {}): { el: HTMLDivElement } {
  ensureToolbarStyles();

  const el = document.createElement("div");

  const classes = [
    "am-toolbar",
    opts.variant === "dense" ? "am-toolbar--dense" : "",
    opts.disableGutters ? "am-toolbar--no-gutters" : "",
    opts.className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  el.className = classes;

  if (opts.role) el.setAttribute("role", opts.role);
  if (opts.ariaLabel) el.setAttribute("aria-label", opts.ariaLabel);
  if (opts.testId) el.setAttribute("data-testid", opts.testId);

  applyStyle(el, opts.style);
  appendContent(el, opts.children);

  return { el };
}
