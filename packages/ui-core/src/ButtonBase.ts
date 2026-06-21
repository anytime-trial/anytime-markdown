/**
 * 脱React の vanilla DOM ファクトリ — ButtonBase（MUI ButtonBase / `trail-viewer/src/ui/ButtonBase.tsx` 置換）。
 *
 * リセットスタイル付きの基本ボタン（`<button type="button">`）。MUI ButtonBase と同じく
 * className / style / disabled / onClick を受ける。`sx` は受理しない（ui-core 方針）。
 * 子コンテンツは `VanillaContent`（string / Node / 配列）で受け取り `appendContent` で流し込む。
 * テーマ色はデフォルトスタイルを持たない（呼び元が className / style で指定する）。
 */

import { appendContent, applyStyle, ensureStyle, type VanillaContent } from "./dom";

const BUTTON_BASE_STYLE_ID = "am-ui-button-base-styles";

/** focus-visible リング・タッチターゲットの共有 CSS を 1 度だけ注入する。 */
function ensureButtonBaseStyles(): void {
  ensureStyle(
    BUTTON_BASE_STYLE_ID,
    ".am-btn-base{display:inline-flex;align-items:center;justify-content:center;" +
      "box-sizing:border-box;background:none;border:0;margin:0;padding:0;cursor:pointer;" +
      "text-decoration:none;-webkit-tap-highlight-color:transparent;font:inherit;color:inherit;}" +
      ".am-btn-base:focus-visible{outline:2px solid var(--am-color-primary-main);outline-offset:2px;}" +
      ".am-btn-base:disabled{cursor:default;pointer-events:none;}" +
      "@media (pointer:coarse){.am-btn-base{min-height:44px;}}",
  );
}

/** {@link createButtonBase} のオプション。`trail-viewer/src/ui/ButtonBase.tsx` の ButtonBaseProps 対応範囲。 */
export interface CreateButtonBaseOptions {
  /** ボタン内のコンテンツ（string / Node / その配列）。 */
  children?: VanillaContent;
  /** button type 属性（既定 "button"）。 */
  type?: "button" | "submit" | "reset";
  /** 無効化。 */
  disabled?: boolean;
  /** クリックハンドラ。 */
  onClick?: (e: MouseEvent) => void;
  /** 追加クラス名。 */
  className?: string;
  /** role 属性。 */
  role?: string;
  /** aria-label。 */
  ariaLabel?: string;
  /** data-testid 属性。 */
  testId?: string;
  /** 追加スタイル（cssText の後に上書き）。 */
  style?: Partial<CSSStyleDeclaration>;
}

/**
 * MUI ButtonBase 相当の最小 vanilla 版（`trail-viewer/src/ui/ButtonBase.tsx` 置換）。
 *
 * `<button type="button">` にリセットスタイルを適用し、children / onClick / disabled を受ける。
 * interactive state を持たないため update / destroy は提供しない
 * （規約: 静的 content + 単純イベントは不要）。
 */
export function createButtonBase(opts: CreateButtonBaseOptions = {}): { el: HTMLButtonElement } {
  ensureButtonBaseStyles();

  const el = document.createElement("button");
  el.type = opts.type ?? "button";

  const baseClass = "am-btn-base";
  el.className = opts.className ? `${baseClass} ${opts.className}` : baseClass;

  if (opts.role) el.setAttribute("role", opts.role);
  if (opts.ariaLabel) el.setAttribute("aria-label", opts.ariaLabel);
  if (opts.testId) el.setAttribute("data-testid", opts.testId);
  if (opts.disabled) el.disabled = true;

  applyStyle(el, opts.style);
  appendContent(el, opts.children);

  if (opts.onClick) {
    el.addEventListener("click", opts.onClick);
  }

  return { el };
}
