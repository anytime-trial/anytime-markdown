/**
 * 脱React の vanilla DOM ファクトリ — ListItem（MUI ListItem /
 * `trail-viewer/src/ui/ListItem.tsx` 置換）。
 *
 * `<li>` の静的リスト行。`disablePadding` オプションで内部余白をゼロにできる。
 * クリック可能な行が必要な場合は `createListItemButton` を使う。
 * テーマ色は持たない（純レイアウト）。
 */

import { appendContent, applyStyle, type VanillaContent } from "./dom";

/** {@link createListItem} のオプション。React 版 ListItemProps の vanilla 再現範囲。 */
export interface CreateListItemOptions {
  /** 中身（string / Node / その配列）。 */
  children?: VanillaContent;
  /** true のとき内部パディングをゼロにする（既定 false）。 */
  disablePadding?: boolean;
  /** 追加クラス名。 */
  className?: string;
  /** 追加スタイル。 */
  style?: Partial<CSSStyleDeclaration>;
  /** role 属性。 */
  role?: string;
  /** aria-label。 */
  ariaLabel?: string;
  /** data-testid 属性。 */
  testId?: string;
}

/**
 * ListItem（`<li>` 静的行）を生成する。
 *
 * static content かつイベント登録なしのため destroy は提供しない。
 */
export function createListItem(opts: CreateListItemOptions = {}): { el: HTMLLIElement } {
  const el = document.createElement("li");
  const padding = opts.disablePadding ? "0" : "4px 0";
  el.style.cssText = `display:flex;align-items:center;box-sizing:border-box;padding:${padding};`;
  applyStyle(el, opts.style);

  if (opts.disablePadding) el.setAttribute("data-disable-padding", "true");
  if (opts.className) el.className = opts.className;
  if (opts.role) el.setAttribute("role", opts.role);
  if (opts.ariaLabel) el.setAttribute("aria-label", opts.ariaLabel);
  if (opts.testId) el.setAttribute("data-testid", opts.testId);

  appendContent(el, opts.children);

  return { el };
}
