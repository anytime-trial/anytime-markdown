/**
 * 脱React の vanilla DOM ListItemIcon ファクトリ（MUI ListItemIcon / ui/ListItemIcon.tsx 置換）。
 *
 * MenuItem 内のアイコン枠。`ui/ListItemIcon.module.css` の見た目（minWidth 36・action.active 色）を
 * 素 DOM で再現する。テーマ色は `--am-color-*` CSS 変数で追従し React テーマ API に依存しない。
 * `vanillaToolbar.ts` / Button.ts の cssText パターンに揃える。
 */

import { appendContent, applyStyle, type VanillaContent } from "./dom";

/** {@link createListItemIcon} のオプション。React `ListItemIconProps` の vanilla 再現範囲。 */
export interface CreateListItemIconOptions {
  /** アイコン本体（svg 等。string / Node / その配列）。 */
  children?: VanillaContent;
  /** 追加クラス名（外部スタイルとの結合用）。 */
  className?: string;
  /** 追加スタイル（minWidth 上書き等）。 */
  style?: Partial<CSSStyleDeclaration>;
}

// ui/ListItemIcon.module.css .root と一字一句対応。--am-menu-icon-minw は MenuItem dense 等で上書き可能。
const BASE_CSS =
  "display:inline-flex;align-items:center;flex-shrink:0;" +
  "min-width:var(--am-menu-icon-minw, 36px);color:var(--am-color-action-active);";

/**
 * vanilla ListItemIcon を生成する。
 *
 * @returns `el`（span 要素）。可変要素を持たないため update / destroy は提供しない。
 */
export function createListItemIcon(opts: CreateListItemIconOptions = {}): {
  el: HTMLSpanElement;
} {
  const el = document.createElement("span");
  el.style.cssText = BASE_CSS;
  if (opts.className) el.className = opts.className;
  applyStyle(el, opts.style);
  appendContent(el, opts.children);
  return { el };
}
