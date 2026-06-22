/**
 * 脱React の vanilla DOM InputAdornment ファクトリ（MUI InputAdornment / `trail-viewer/src/ui/InputAdornment.tsx` 置換）。
 *
 * TextField の先頭 / 末尾に付けるデコレーション `<span>`。`position` ("start" | "end") を
 * data 属性で保持し、親 TextField がレイアウト側でフレックス順を制御できるようにする。
 * 内容は string / Node どちらでも受け入れる。
 */

import { appendContent, applyStyle, type VanillaContent } from "./dom";

/** createInputAdornment のオプション。`ui/InputAdornment.tsx` の InputAdornmentProps に対応する範囲。 */
export interface CreateInputAdornmentOptions {
  /** 配置位置（start = 入力の前・end = 後）。 */
  position?: "start" | "end";
  /** 中身（string / Node / その配列）。 */
  children?: VanillaContent;
  /** 追加スタイル。 */
  style?: Partial<CSSStyleDeclaration>;
  /** 追加クラス名。 */
  className?: string;
  /** data-testid 属性。 */
  testId?: string;
}

// root: inline-flex でアイコンやテキストを中央揃え。
const ROOT_BASE_CSS =
  "display:inline-flex;align-items:center;white-space:nowrap;" +
  "color:var(--am-color-text-secondary,rgba(0,0,0,0.54));height:0.01em;max-height:2em;";

const ROOT_START_CSS = "margin-right:8px;";
const ROOT_END_CSS = "margin-left:8px;";

/**
 * vanilla InputAdornment を生成する。
 *
 * `<span>` に position / children / style を適用して返す。
 *
 * @returns `el`（span 要素）。
 */
export function createInputAdornment(opts: CreateInputAdornmentOptions = {}): {
  el: HTMLSpanElement;
} {
  const position = opts.position ?? "start";
  const el = document.createElement("span");

  el.style.cssText =
    ROOT_BASE_CSS + (position === "end" ? ROOT_END_CSS : ROOT_START_CSS);
  applyStyle(el, opts.style);

  el.className = ["am-input-adornment", `am-input-adornment--${position}`, opts.className ?? ""]
    .filter(Boolean)
    .join(" ");

  el.setAttribute("data-position", position);
  if (opts.testId) el.setAttribute("data-testid", opts.testId);

  appendContent(el, opts.children);

  return { el };
}
