/**
 * 脱React の vanilla DOM InputLabel ファクトリ（MUI InputLabel / `trail-viewer/src/ui/InputLabel.tsx` 置換）。
 *
 * `<input>` の上部に表示するラベル `<label>`。`shrink` フラグで縮小状態のスタイルを制御する。
 * `error` 時は `--am-color-error-main` でテキスト色を変更する。
 * テーマ色は `--am-color-*` CSS 変数で追従し、React hook（useIsDark 等）には依存しない。
 */

import { appendContent, applyStyle, type VanillaContent } from "./dom";

/** createInputLabel のオプション。`ui/InputLabel.tsx` の InputLabelProps に対応する範囲。 */
export interface CreateInputLabelOptions {
  /** true のとき縮小スタイル（フォントサイズ縮小・上部配置）を適用する。 */
  shrink?: boolean;
  /** エラー状態。テキスト色を error-main へ変更する。 */
  error?: boolean;
  /** 中身（string / Node / その配列）。 */
  children?: VanillaContent;
  /** 追加クラス名。 */
  className?: string;
  /** for 属性（紐付ける input の id）。 */
  htmlFor?: string;
  /** role 属性。 */
  role?: string;
  /** aria-label。 */
  ariaLabel?: string;
  /** data-testid 属性。 */
  testId?: string;
  /** 追加スタイル。 */
  style?: Partial<CSSStyleDeclaration>;
}

// 通常ラベルのスタイル（MUI InputLabel 相当）。
const LABEL_BASE_CSS =
  "display:block;transform-origin:top left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" +
  "max-width:133%;font-size:1rem;line-height:1.4375em;letter-spacing:0.00938em;" +
  "color:var(--am-color-text-secondary,rgba(0,0,0,0.6));";

// shrink: 0.75 倍縮小スタイル。
const LABEL_SHRINK_CSS =
  "font-size:0.75rem;transform:translate(0,-1.5px) scale(0.75);";

// error 状態ではテキスト色を error-main に変更する。
const LABEL_ERROR_CSS = "color:var(--am-color-error-main,#d32f2f);";

/**
 * vanilla InputLabel を生成する。
 *
 * `<label>` 要素に shrink / error / htmlFor / children を付与して返す。
 *
 * @returns `el`（label 要素）。
 */
export function createInputLabel(opts: CreateInputLabelOptions = {}): {
  el: HTMLLabelElement;
} {
  const el = document.createElement("label");

  el.style.cssText =
    LABEL_BASE_CSS +
    (opts.shrink ? LABEL_SHRINK_CSS : "") +
    (opts.error ? LABEL_ERROR_CSS : "");
  applyStyle(el, opts.style);

  el.className = [
    "am-input-label",
    opts.shrink ? "am-input-label--shrink" : "",
    opts.error ? "am-input-label--error" : "",
    opts.className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  if (opts.htmlFor) el.setAttribute("for", opts.htmlFor);
  if (opts.role) el.setAttribute("role", opts.role);
  if (opts.ariaLabel) el.setAttribute("aria-label", opts.ariaLabel);
  if (opts.testId) el.setAttribute("data-testid", opts.testId);
  if (opts.error) el.setAttribute("data-error", "true");
  if (opts.shrink) el.setAttribute("data-shrink", "true");

  appendContent(el, opts.children);

  return { el };
}
