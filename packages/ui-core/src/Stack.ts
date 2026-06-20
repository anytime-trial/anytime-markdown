/**
 * 脱React の vanilla DOM ファクトリ — Stack（MUI Stack / `ui/Stack.tsx` 置換）。
 *
 * flex コンテナ（`display:flex` + `flex-direction` + `gap`）を素 DOM で再現する。
 * `ui/Stack.tsx` と同じく `spacing`（MUI 単位 = ×8px の gap）/ `direction`（row|column）/
 * `alignItems` / `justifyContent` を受ける。React / MUI に依存せず、`chrome/vanillaToolbar.ts`
 * の cssText パターンに従う。テーマ色は持たない（純レイアウト）。
 *
 * children は string / Node / その配列を受理し、`dom.appendContent` で流し込む（string は span ラップ）。
 * static content かつイベント登録なしのため update / destroy は提供しない（Paper.ts と同じ規約）。
 */

import { appendContent, applyStyle, type VanillaContent } from "./dom";

export type StackDirection = "row" | "column";

/** createStack のオプション。`ui/Stack.tsx` の StackProps に対応する範囲。 */
export interface CreateStackOptions {
  /** flex 方向。既定 "column"（React 原版と同じ）。 */
  direction?: StackDirection;
  /** MUI spacing 単位（×8px の gap）。0 は gap なし。既定 0。 */
  spacing?: number;
  /** align-items（CSS 値をそのまま渡す）。 */
  alignItems?: string;
  /** justify-content（CSS 値をそのまま渡す）。 */
  justifyContent?: string;
  /** 中身（string / Node / その配列）。 */
  children?: VanillaContent;
  /** 追加クラス名（外部スタイルとの結合用）。 */
  className?: string;
  /** 追加スタイル（cssText の後に Object.assign で上書き）。 */
  style?: Partial<CSSStyleDeclaration>;
  /** data-testid 属性。 */
  testId?: string;
  /** role 属性。 */
  role?: string;
  /** aria-label。 */
  ariaLabel?: string;
}

/** MUI spacing 単位（1 = 8px）。`ui/Stack.tsx` の `spacing * 8` に一致。 */
const SPACING_UNIT_PX = 8;

/**
 * direction / spacing / alignItems / justifyContent から cssText を組み立てる。
 * `ui/Stack.tsx` の composedStyle（display:flex + flex-direction + gap + align/justify）に対応。
 */
function buildCssText(
  direction: StackDirection,
  spacing: number,
  alignItems: string | undefined,
  justifyContent: string | undefined,
): string {
  let css = `display:flex;flex-direction:${direction};`;
  if (spacing) css += `gap:${spacing * SPACING_UNIT_PX}px;`;
  if (alignItems) css += `align-items:${alignItems};`;
  if (justifyContent) css += `justify-content:${justifyContent};`;
  return css;
}

/**
 * Stack（`<div>` flex コンテナ）を生成する。
 *
 * static content かつイベント登録なしのため update / destroy は提供しない
 * （規約: static content / no event → 不要）。動的要件が出た場合は呼び元で再生成するか
 * `el.style.cssText` を直接操作する。
 */
export function createStack(opts: CreateStackOptions = {}): { el: HTMLDivElement } {
  const direction: StackDirection = opts.direction ?? "column";
  const spacing = opts.spacing ?? 0;

  const el = document.createElement("div");
  el.style.cssText = buildCssText(direction, spacing, opts.alignItems, opts.justifyContent);
  el.setAttribute("data-direction", direction);
  el.setAttribute("data-spacing", String(spacing));

  if (opts.role) el.setAttribute("role", opts.role);
  if (opts.ariaLabel) el.setAttribute("aria-label", opts.ariaLabel);
  if (opts.testId) el.setAttribute("data-testid", opts.testId);
  if (opts.className) el.className = opts.className;

  // style は cssText の後（cssText が上書きされないよう Object.assign）。
  applyStyle(el, opts.style);

  appendContent(el, opts.children);

  return { el };
}
