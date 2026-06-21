/**
 * 脱React の vanilla DOM ファクトリ — Box（MUI Box / `trail-viewer/src/ui/Box.tsx` 置換）。
 *
 * 任意要素（既定 `<div>`）に className / role / aria-label / data-testid / style / children を
 * 適用するだけの最小コンテナ。`sx` は受理しない（ユーザー方針: ui-core は純 vanilla・
 * sx は変換時に style/CSS へ解消する）。テーマ色は持たない（純レイアウト）。
 */

import { appendContent, applyStyle, type VanillaContent } from "./dom";

/** createBox のオプション。`ui/Box.tsx` の BoxProps に対応する範囲。 */
export interface CreateBoxOptions {
  /** 生成する要素種（既定 "div"）。 */
  component?: keyof HTMLElementTagNameMap;
  /** 中身（string / Node / その配列）。 */
  children?: VanillaContent;
  /** 追加スタイル。 */
  style?: Partial<CSSStyleDeclaration>;
  /** 追加クラス名。 */
  className?: string;
  /** role 属性。 */
  role?: string;
  /** aria-label。 */
  ariaLabel?: string;
  /** data-testid 属性。 */
  testId?: string;
}

/** MUI Box 相当の最小 vanilla 版（`ui/Box.tsx` の素 DOM 等価）。sx は受理しない。 */
export function createBox(opts: CreateBoxOptions = {}): { el: HTMLElement } {
  const el = document.createElement(opts.component ?? "div");
  if (opts.className) el.className = opts.className;
  if (opts.role) el.setAttribute("role", opts.role);
  if (opts.ariaLabel) el.setAttribute("aria-label", opts.ariaLabel);
  if (opts.testId) el.setAttribute("data-testid", opts.testId);
  applyStyle(el, opts.style);
  appendContent(el, opts.children);
  return { el };
}
