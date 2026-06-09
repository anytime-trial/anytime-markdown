/**
 * 脱React の vanilla DOM ListItemText ファクトリ（MUI ListItemText / ui/ListItemText.tsx 置換）。
 *
 * MenuItem 内のテキスト枠。`ui/ListItemText.module.css` の見た目（flex 伸長・余白 0・省略表示）を
 * 素 DOM で再現する。font は MenuItem から継承する（自前で指定しない）。React テーマ API に依存しない。
 * `vanillaToolbar.ts` / Button.ts の cssText パターンに揃える。
 */

import { appendContent, applyStyle, type VanillaContent } from "./dom";

/** {@link createListItemText} のオプション。React `ListItemTextProps` の vanilla 再現範囲。 */
export interface CreateListItemTextOptions {
  /** テキスト本体（string / Node / その配列）。 */
  children?: VanillaContent;
  /** 追加クラス名（外部スタイルとの結合用）。 */
  className?: string;
  /** 追加スタイル。 */
  style?: Partial<CSSStyleDeclaration>;
}

// ui/ListItemText.module.css .root と一字一句対応。font は親（MenuItem）から継承する。
const BASE_CSS =
  "flex:1 1 auto;min-width:0;margin:0;overflow:hidden;text-overflow:ellipsis;";

/**
 * vanilla ListItemText を生成する。
 *
 * @returns `el`（span 要素）。可変要素を持たないため update / destroy は提供しない。
 */
export function createListItemText(opts: CreateListItemTextOptions = {}): {
  el: HTMLSpanElement;
} {
  const el = document.createElement("span");
  el.style.cssText = BASE_CSS;
  if (opts.className) el.className = opts.className;
  applyStyle(el, opts.style);
  appendContent(el, opts.children);
  return { el };
}
