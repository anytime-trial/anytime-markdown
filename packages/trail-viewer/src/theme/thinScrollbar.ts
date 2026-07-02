/**
 * テーマ追従の細身スクロールバー（旧 designTokens.scrollbarSx の vanilla 版）。
 *
 * `::-webkit-scrollbar` 系の擬似要素は inline style で書けないため、`document.head` へ 1 度だけ
 * 共有 <style> を注入し、対象スクロール要素に `am-thin-scrollbar` クラスを付与して使う
 * （ui-core の ensureStyle パターンと同方式）。色は applyTrailThemeVars 注入の CSS 変数に追従する。
 */

export const THIN_SCROLLBAR_CLASS = 'am-thin-scrollbar';

const STYLE_ID = 'am-trv-thin-scrollbar-styles';

/** 細身スクロールバーの共有スタイルを一度だけ注入する。 */
export function ensureThinScrollbarStyle(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  const thumb = 'var(--am-color-text-disabled, rgba(0,0,0,0.38))';
  const thumbHover = 'var(--am-color-text-secondary, rgba(0,0,0,0.6))';
  style.textContent =
    `.${THIN_SCROLLBAR_CLASS}{scrollbar-width:thin;scrollbar-color:${thumb} transparent;}` +
    `.${THIN_SCROLLBAR_CLASS}::-webkit-scrollbar{width:6px;height:6px;}` +
    `.${THIN_SCROLLBAR_CLASS}::-webkit-scrollbar-track{background:transparent;}` +
    `.${THIN_SCROLLBAR_CLASS}::-webkit-scrollbar-thumb{background:${thumb};border-radius:3px;}` +
    `.${THIN_SCROLLBAR_CLASS}::-webkit-scrollbar-thumb:hover{background:${thumbHover};}`;
  document.head.appendChild(style);
}

/** 要素に細身スクロールバーを適用する（スタイル注入 + クラス付与）。 */
export function applyThinScrollbar(el: HTMLElement): void {
  ensureThinScrollbarStyle();
  el.classList.add(THIN_SCROLLBAR_CLASS);
}
