/**
 * 脱React の vanilla DOM FormLabel ファクトリ（MUI FormLabel / `trail-viewer/src/ui/FormLabel.tsx` 置換）。
 *
 * `<label>` 要素をラップする薄いコンテナ。`error` 時は `--am-color-error-main` でテキスト色を変更する。
 * テーマ色は `--am-color-*` CSS 変数で追従し、React hook（useIsDark 等）には依存しない。
 */

import { appendContent, applyStyle, type VanillaContent } from "./dom";

/** createFormLabel のオプション。`ui/FormLabel.tsx` の FormLabelProps に対応する範囲。 */
export interface CreateFormLabelOptions {
  /** エラー状態。テキスト色を error-main へ変更する。 */
  error?: boolean;
  /** 中身（string / Node / その配列）。 */
  children?: VanillaContent;
  /** 追加クラス名。 */
  className?: string;
  /** role 属性。 */
  role?: string;
  /** aria-label。 */
  ariaLabel?: string;
  /** data-testid 属性。 */
  testId?: string;
  /** 追加スタイル。 */
  style?: Partial<CSSStyleDeclaration>;
}

// 通常の label スタイル。
const LABEL_BASE_CSS =
  "display:block;font-size:1rem;line-height:1.4375em;letter-spacing:0.00938em;" +
  "color:var(--am-color-text-secondary,rgba(0,0,0,0.6));";

// error 状態ではテキスト色を error-main に変更する。
const LABEL_ERROR_CSS = "color:var(--am-color-error-main,#d32f2f);";

/**
 * vanilla FormLabel を生成する。
 *
 * `<label>` 要素に error / className / children を付与して返す。
 *
 * @returns `el`（label 要素）。
 */
export function createFormLabel(opts: CreateFormLabelOptions = {}): {
  el: HTMLLabelElement;
} {
  const el = document.createElement("label");

  el.style.cssText = LABEL_BASE_CSS + (opts.error ? LABEL_ERROR_CSS : "");
  applyStyle(el, opts.style);

  el.className = [
    "am-form-label",
    opts.error ? "am-form-label--error" : "",
    opts.className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  if (opts.role) el.setAttribute("role", opts.role);
  if (opts.ariaLabel) el.setAttribute("aria-label", opts.ariaLabel);
  if (opts.testId) el.setAttribute("data-testid", opts.testId);
  if (opts.error) el.setAttribute("data-error", "true");

  appendContent(el, opts.children);

  return { el };
}
