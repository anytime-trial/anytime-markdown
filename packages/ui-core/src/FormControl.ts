/**
 * 脱React の vanilla DOM FormControl ファクトリ（MUI FormControl / `trail-viewer/src/ui/FormControl.tsx` 置換）。
 *
 * フォーム要素（TextField / Select 等）を包む垂直スタック型コンテナ。`fullWidth` / `error` を
 * data 属性とスタイルで反映する。React 実装は className + style 合成のみで実質ラッパーのため、
 * 素 DOM 版も同じ薄さに留める。`sx` は受理しない。
 */

import { appendContent, applyStyle, type VanillaContent } from "./dom";

/** createFormControl のオプション。`ui/FormControl.tsx` の FormControlProps に対応する範囲。 */
export interface CreateFormControlOptions {
  /** fullWidth 時は width:100% を付与する。 */
  fullWidth?: boolean;
  /** エラー状態。data-error 属性と color を変更する（子が inherit で追従できる）。 */
  error?: boolean;
  /** disabled 状態。 */
  disabled?: boolean;
  /** 中身（string / Node / その配列）。 */
  children?: VanillaContent;
  /** 追加スタイル。 */
  style?: Partial<CSSStyleDeclaration>;
  /** 追加クラス名。 */
  className?: string;
  /** data-testid 属性。 */
  testId?: string;
}

// root: display:flex 縦積み。
const ROOT_BASE_CSS = "display:inline-flex;flex-direction:column;position:relative;";
const ROOT_FULLWIDTH_CSS = "width:100%;";

/**
 * vanilla FormControl を生成する。
 *
 * `<div>` の垂直スタックコンテナ。`fullWidth` で幅 100%、`error` で data-error 属性を付与。
 *
 * @returns `el`（root div）。
 */
export function createFormControl(opts: CreateFormControlOptions = {}): {
  el: HTMLDivElement;
} {
  const el = document.createElement("div");

  const base = ROOT_BASE_CSS + (opts.fullWidth ? ROOT_FULLWIDTH_CSS : "");
  el.style.cssText = base;
  applyStyle(el, opts.style);

  el.className = ["am-form-control", opts.fullWidth ? "am-form-control--fullwidth" : "", opts.className ?? ""]
    .filter(Boolean)
    .join(" ");

  if (opts.error) el.setAttribute("data-error", "true");
  if (opts.disabled) el.setAttribute("data-disabled", "true");
  if (opts.testId) el.setAttribute("data-testid", opts.testId);

  appendContent(el, opts.children);

  return { el };
}
