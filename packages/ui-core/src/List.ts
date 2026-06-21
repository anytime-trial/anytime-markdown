/**
 * 脱React の vanilla DOM ファクトリ — List（MUI List / `trail-viewer/src/ui/List.tsx` 置換）。
 *
 * `<ul>` のスタイルをリセットした最小リストコンテナ。`dense` オプションで
 * 子の ListItem / ListItemButton に密度情報を渡す想定（子への伝播は呼び元が担う）。
 * テーマ色は持たない（純レイアウト）。
 */

import { appendContent, applyStyle, type VanillaContent } from "./dom";

/** {@link createList} のオプション。React 版 ListProps の vanilla 再現範囲。 */
export interface CreateListOptions {
  /** 中身（ListItem / ListItemButton の Node / その配列）。 */
  children?: VanillaContent;
  /** 高密度モード（子への伝播は呼び元が担う）。 */
  dense?: boolean;
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
 * List（`<ul>` スタイルリセット）を生成する。
 *
 * static content かつイベント登録なしのため destroy は提供しない
 * （規約: static content / no event → 不要）。
 */
export function createList(opts: CreateListOptions = {}): { el: HTMLUListElement } {
  const el = document.createElement("ul");
  el.style.cssText = "list-style:none;margin:0;padding:0;";
  applyStyle(el, opts.style);

  if (opts.dense) el.setAttribute("data-dense", "true");
  if (opts.className) el.className = opts.className;
  if (opts.role) el.setAttribute("role", opts.role);
  if (opts.ariaLabel) el.setAttribute("aria-label", opts.ariaLabel);
  if (opts.testId) el.setAttribute("data-testid", opts.testId);

  appendContent(el, opts.children);

  return { el };
}
