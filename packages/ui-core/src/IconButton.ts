/**
 * 脱React の vanilla DOM IconButton ファクトリ（Phase 3 / ホスト隔離）。
 *
 * React 実装 `ui/IconButton.tsx`（MUI IconButton 置換）の素 DOM 版。円形・hover 背景・
 * focus リング・サイズ別パディングを CSS 変数（`--am-color-*` / applyEditorThemeCssVars 注入）
 * で再現し、useIsDark 等の React テーマ API に依存しない。
 *
 * hover / focus-visible / disabled の pseudo-class は inline style で書けないため、`document.head`
 * へ 1 度だけ注入する共有ルール（`button[data-ui-icon-button]`）で表現する（インスタンス毎の
 * `<style>` 注入はしない）。SVG アイコンは `svgIcon()`（./dom）で inline 埋め込みできる。
 */

import { appendContent, type VanillaContent } from "./dom";

/** IconButton のサイズ。パディングでサイズが決まる（アイコン寸法は children 側が決定）。 */
export type IconButtonSize = "xs" | "compact" | "small" | "medium";

/** サイズ別パディング（ui/IconButton.module.css と一致）。 */
const SIZE_PADDING: Record<IconButtonSize, string> = {
  xs: "2px",
  compact: "4px",
  small: "5px",
  medium: "8px",
};

const TRANSITION =
  "background-color var(--am-duration-fast) var(--am-ease-standard)";

/** hover / focus-visible / disabled の共有ルールを document.head へ 1 度だけ注入する。 */
const SHARED_STYLE_ID = "am-ui-icon-button-styles";
function ensureIconButtonStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(SHARED_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SHARED_STYLE_ID;
  style.textContent =
    "button[data-ui-icon-button]:hover:not(:disabled){background:var(--am-color-action-hover);}" +
    "button[data-ui-icon-button]:disabled{opacity:0.5;cursor:default;}" +
    "button[data-ui-icon-button]:focus-visible{outline:2px solid var(--am-color-primary-main);outline-offset:1px;}" +
    // タッチ環境では視覚サイズを保ったまま当たり判定を 44px へ（仕様8章 タップターゲット）。
    "@media (pointer:coarse){button[data-ui-icon-button]{min-width:44px;min-height:44px;}}";
  document.head.appendChild(style);
}

/** 円形 IconButton のオプション。 */
export interface CreateIconButtonOptions {
  /** パディングでサイズが決まる。既定 medium。 */
  size?: IconButtonSize;
  /** a11y ラベル（aria-label）。 */
  ariaLabel?: string;
  /** ネイティブ title（ツールチップ）。 */
  title?: string;
  /** 無効状態。 */
  disabled?: boolean;
  /** ボタンの type。既定 "button"。 */
  type?: "button" | "submit" | "reset";
  /** 追加クラス名。 */
  className?: string;
  /** data-testid 属性。 */
  testId?: string;
  /** 中身。string は span でラップ、Node はそのまま追加、配列は順に追加。 */
  children?: VanillaContent;
  /** クリックハンドラ。 */
  onClick?: (e: MouseEvent) => void;
}

/** IconButton ファクトリの戻り値。 */
export interface IconButtonHandle {
  /** root の `<button>` 要素。 */
  el: HTMLButtonElement;
  /** 可変プロパティ（disabled / ariaLabel / title / size / children）の更新。 */
  update: (opts: Partial<CreateIconButtonOptions>) => void;
  /** event listener 削除。 */
  destroy: () => void;
}

function applySize(el: HTMLButtonElement, size: IconButtonSize): void {
  el.style.padding = SIZE_PADDING[size];
}

/**
 * MUI IconButton の置換（vanilla）。円形・hover 背景・focus リングを再現。
 * color は currentColor を継承（呼び元で `handle.el.style.color` 上書き可）。
 */
export function createIconButton(
  opts: CreateIconButtonOptions = {},
): IconButtonHandle {
  ensureIconButtonStyles();
  const el = document.createElement("button");
  const size: IconButtonSize = opts.size ?? "medium";

  el.type = opts.type ?? "button";
  el.dataset.uiIconButton = "";

  // 基本スタイル（ui/IconButton.module.css 相当）。pseudo-class は共有 <style> 側で再現。
  el.style.cssText =
    "display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;" +
    "border:none;border-radius:50%;background:transparent;color:inherit;cursor:pointer;" +
    `transition:${TRANSITION};`;
  applySize(el, size);

  if (opts.className) el.className = opts.className;
  if (opts.ariaLabel !== undefined) el.setAttribute("aria-label", opts.ariaLabel);
  if (opts.title !== undefined) el.title = opts.title;
  if (opts.testId !== undefined) el.setAttribute("data-testid", opts.testId);
  if (opts.disabled) el.disabled = true;
  if (opts.children !== undefined) appendContent(el, opts.children);

  let clickHandler = opts.onClick;
  if (clickHandler) el.addEventListener("click", clickHandler as EventListener);

  function update(next: Partial<CreateIconButtonOptions>): void {
    if (next.disabled !== undefined) el.disabled = next.disabled;
    if (next.ariaLabel !== undefined) el.setAttribute("aria-label", next.ariaLabel);
    if (next.title !== undefined) el.title = next.title;
    if (next.size !== undefined) applySize(el, next.size);
    if (next.className !== undefined) el.className = next.className;
    if (next.children !== undefined) {
      el.replaceChildren();
      appendContent(el, next.children);
    }
    if (next.onClick !== undefined) {
      if (clickHandler) el.removeEventListener("click", clickHandler as EventListener);
      clickHandler = next.onClick;
      if (clickHandler) el.addEventListener("click", clickHandler as EventListener);
    }
  }

  function destroy(): void {
    if (clickHandler) {
      el.removeEventListener("click", clickHandler as EventListener);
      clickHandler = undefined;
    }
  }

  return { el, update, destroy };
}
