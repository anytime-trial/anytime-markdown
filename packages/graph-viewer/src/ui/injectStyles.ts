/**
 * graph-viewer 自前 UI キットのスタイルを実行時に注入する。
 *
 * CSS Modules を使わない理由: 消費先の一つ vscode-graph-extension の webview webpack に
 * css-loader/style-loader が無く、`*.module.css` の import がビルドを壊すため。
 * 代わりに単一の `<style>` を冪等に注入する（バンドラ非依存・追加 devDep 不要）。
 *
 * 擬似要素（:hover / :focus-visible / ::-webkit-scrollbar）も実 CSS なので表現できる。
 * テーマ色は {@link themeCssVars} が documentElement へ設定する `--gv-color-*` を参照する。
 */

const STYLE_ELEMENT_ID = 'anytime-graph-ui-styles';

const CSS = `
/* ---- Text ---- */
.gv-text { color: inherit; margin: 0; }
.gv-text-caption { font-size: 0.75rem; line-height: 1.66; color: inherit; }
.gv-text-subtitle2 { font-size: 0.875rem; font-weight: 600; line-height: 1.57; }
.gv-text-secondary { color: var(--gv-color-text-secondary); }
.gv-text-error { color: var(--gv-color-error-main); }
.gv-link { cursor: pointer; }
.gv-link:hover { text-decoration: underline; }

/* ---- テーマ対応 textarea（DocEditorModal） ---- */
.gv-doc-textarea::placeholder { color: var(--gv-color-text-secondary); }

/* ---- Button ---- */
.gv-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  box-sizing: border-box;
  border: 1px solid transparent;
  border-radius: 4px;
  font: inherit;
  font-weight: 500;
  font-size: 0.8125rem;
  line-height: 1.75;
  text-transform: none;
  padding: 4px 10px;
  min-height: 30px;
  cursor: pointer;
  user-select: none;
  background: transparent;
  color: var(--gv-color-primary-main);
  transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}
.gv-btn--small { font-size: 0.75rem; padding: 3px 8px; min-height: 26px; }
.gv-btn--text:hover:not(:disabled) { background: var(--gv-color-action-hover); }
.gv-btn--outlined { border-color: var(--gv-color-divider); color: var(--gv-color-text-primary); }
.gv-btn--outlined:hover:not(:disabled) { background: var(--gv-color-action-hover); }
.gv-btn--contained {
  background: var(--gv-color-primary-main);
  color: var(--gv-color-primary-contrast);
  border-color: transparent;
}
.gv-btn--contained:hover:not(:disabled) { filter: brightness(0.92); }
.gv-btn:disabled { opacity: 0.5; cursor: default; }
.gv-btn:focus-visible { outline: 2px solid var(--gv-color-primary-main); outline-offset: 1px; }

/* ---- IconButton ---- */
.gv-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border: none;
  border-radius: 50%;
  padding: 5px;
  cursor: pointer;
  background: transparent;
  color: inherit;
  transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}
.gv-icon-btn--small { padding: 4px; }
.gv-icon-btn:hover:not(:disabled) { background: var(--gv-color-action-hover); }
.gv-icon-btn:disabled { opacity: 0.38; cursor: default; }
.gv-icon-btn:focus-visible { outline: 2px solid var(--gv-color-primary-main); outline-offset: 1px; }

/* ---- Divider ---- */
.gv-divider { height: 1px; border: none; background: var(--gv-color-divider); margin: 4px 0; }
.gv-divider--vertical { width: 1px; height: auto; align-self: stretch; margin: 4px 0; }

/* ---- CircularProgress ---- */
.gv-spinner {
  display: inline-block;
  border-radius: 50%;
  border: 2px solid var(--gv-color-divider);
  border-top-color: var(--gv-color-primary-main);
  animation: gv-spin 0.8s linear infinite;
}
@keyframes gv-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .gv-spinner { animation-duration: 2s; } }

/* ---- Menu (anchorEl / anchorPosition) ---- */
.gv-menu-backdrop { position: fixed; inset: 0; z-index: 1300; }
.gv-menu-paper {
  position: fixed;
  /* backdrop より必ず前面に置く。z-index 未指定だと backdrop(1300) が上に来て
     メニュー項目のクリックを全て奪う（jsdom は当たり判定をしないため検知できない）。 */
  z-index: 1301;
  box-sizing: border-box;
  min-width: 112px;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  padding: 4px 0;
  background: var(--gv-color-bg-paper);
  color: var(--gv-color-text-primary);
  border-radius: 4px;
  box-shadow: 0 5px 5px -3px rgba(0,0,0,.20), 0 8px 10px 1px rgba(0,0,0,.14), 0 3px 14px 2px rgba(0,0,0,.12);
  outline: none;
}
.gv-menu-item {
  display: flex;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  list-style: none;
  padding: 6px 16px;
  border: none;
  background: transparent;
  color: var(--gv-color-text-primary);
  font: inherit;
  font-size: 0.875rem;
  text-align: left;
  cursor: pointer;
}
.gv-menu-item:hover:not(.gv-menu-item--disabled) { background: var(--gv-color-action-hover); }
.gv-menu-item--disabled { opacity: 0.38; cursor: default; }
.gv-menu-item:focus-visible { outline: 2px solid var(--gv-color-primary-main); outline-offset: -2px; }
.gv-list-item-icon {
  display: inline-flex;
  align-items: center;
  min-width: 28px;
  color: var(--gv-color-text-secondary);
}
.gv-list-item-text { flex: 1 1 auto; min-width: 0; }

/* ---- TextField ---- */
.gv-textfield {
  box-sizing: border-box;
  font: inherit;
  font-size: 0.8125rem;
  color: var(--gv-color-text-primary);
  background: transparent;
  border: 1px solid var(--gv-color-divider);
  border-radius: 4px;
  padding: 6px 8px;
}
.gv-textfield:focus-visible { outline: none; border-color: var(--gv-color-primary-main); }
.gv-textfield::placeholder { color: var(--gv-color-text-secondary); opacity: 0.7; }
.gv-select { cursor: pointer; }
.gv-select option { background: var(--gv-color-bg-paper); color: var(--gv-color-text-primary); }

/* ---- Chip ---- */
.gv-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  box-sizing: border-box;
  height: 24px;
  padding: 0 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  line-height: 1;
  background: var(--gv-color-action-selected);
  color: var(--gv-color-text-primary);
}
.gv-chip--small { height: 20px; font-size: 0.6875rem; padding: 0 6px; }
.gv-chip__delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 0;
  opacity: 0.7;
}
.gv-chip__delete:hover { opacity: 1; }

/* ---- Dialog ---- */
.gv-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.5);
}
.gv-dialog-paper {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-width: 320px;
  max-width: 90vw;
  max-height: 90vh;
  overflow: hidden;
  background: var(--gv-color-bg-paper);
  color: var(--gv-color-text-primary);
  border-radius: 4px;
  box-shadow: 0 8px 10px -5px rgba(0,0,0,.20), 0 16px 24px 2px rgba(0,0,0,.14), 0 6px 30px 5px rgba(0,0,0,.12);
}
.gv-dialog-title { padding: 16px 24px 8px; font-size: 1.25rem; font-weight: 600; }
.gv-dialog-content { padding: 8px 24px; overflow-y: auto; }
.gv-dialog-content-text { color: var(--gv-color-text-secondary); font-size: 0.875rem; line-height: 1.5; margin: 0; }
.gv-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 8px 12px; }

/* ---- ToggleButtonGroup ---- */
.gv-toggle-group { display: inline-flex; border: 1px solid var(--gv-color-divider); border-radius: 4px; overflow: hidden; }
.gv-toggle-group--full { display: flex; width: 100%; }
.gv-toggle-group--full .gv-toggle-btn { flex: 1; }
.gv-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-left: 1px solid var(--gv-color-divider);
  background: transparent;
  color: var(--gv-color-text-secondary);
  cursor: pointer;
  padding: 4px 8px;
  font: inherit;
  font-size: 0.8125rem;
}
.gv-toggle-btn--small { padding: 2px 6px; font-size: 0.65rem; }
.gv-toggle-btn:first-child { border-left: none; }
.gv-toggle-btn:hover:not(:disabled) { background: var(--gv-color-action-hover); }
.gv-toggle-btn[aria-pressed="true"] { background: var(--gv-color-action-selected); color: var(--gv-color-primary-main); }
.gv-toggle-btn:disabled { opacity: 0.38; cursor: default; }

/* ---- Slider ---- */
.gv-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: var(--gv-color-divider);
  outline: none;
  cursor: pointer;
  margin: 8px 0;
  accent-color: var(--gv-color-primary-main);
}
.gv-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--gv-color-primary-main);
  cursor: pointer;
  border: none;
}
.gv-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--gv-color-primary-main);
  cursor: pointer;
  border: none;
}
.gv-slider--small { height: 3px; }
.gv-slider:focus-visible { outline: 2px solid var(--gv-color-primary-main); outline-offset: 4px; }

/* ---- Slider (range / dual-thumb) ---- */
.gv-slider-range { position: relative; width: 100%; height: 20px; }
.gv-slider-range__track { position: absolute; top: 50%; left: 0; right: 0; height: 4px; transform: translateY(-50%); border-radius: 2px; background: var(--gv-color-divider); }
.gv-slider-range__fill { position: absolute; top: 50%; height: 4px; transform: translateY(-50%); border-radius: 2px; background: var(--gv-color-primary-main); }
.gv-slider-range input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 20px;
  margin: 0;
  background: transparent;
  pointer-events: none;
}
.gv-slider-range input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  pointer-events: auto;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--gv-color-primary-main);
  cursor: pointer;
  border: 2px solid var(--gv-color-bg-paper);
}
.gv-slider-range input[type="range"]::-moz-range-thumb {
  pointer-events: auto;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--gv-color-primary-main);
  cursor: pointer;
  border: 2px solid var(--gv-color-bg-paper);
}

/* ---- ShapeHoverBar フェードイン ---- */
.gv-shape-bar { opacity: 0; animation: gv-shape-bar-fade-in 300ms cubic-bezier(0, 0, 0.2, 1) 400ms forwards; }
@keyframes gv-shape-bar-fade-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) { .gv-shape-bar { animation: none; opacity: 1; } }

/* ---- Switch ---- */
.gv-switch { position: relative; display: inline-flex; align-items: center; width: 34px; height: 20px; cursor: pointer; }
.gv-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.gv-switch__track {
  position: absolute;
  inset: 3px 0;
  border-radius: 7px;
  background: var(--gv-color-text-secondary);
  opacity: 0.4;
  transition: background-color 150ms, opacity 150ms;
}
.gv-switch__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0,0,0,.3);
  transition: transform 150ms cubic-bezier(0.4, 0, 0.2, 1);
}
.gv-switch input:checked + .gv-switch__track { background: var(--gv-color-primary-main); opacity: 0.5; }
.gv-switch input:checked ~ .gv-switch__thumb { transform: translateX(14px); background: var(--gv-color-primary-main); }
.gv-switch input:focus-visible ~ .gv-switch__thumb { outline: 2px solid var(--gv-color-primary-main); outline-offset: 2px; }

/* ---- FormControlLabel ---- */
.gv-form-control-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: var(--gv-color-text-primary);
}

/* ---- ColorSwatch（PropertyPanel の色見本） ---- */
.gv-color-swatch:focus-visible { outline: 2px solid var(--gv-color-primary-main); outline-offset: 2px; }

/* ---- Tooltip ---- */
.gv-tooltip {
  position: fixed;
  z-index: 1500;
  pointer-events: none;
  background: rgba(97,97,97,0.92);
  color: #fff;
  font-size: 0.6875rem;
  font-weight: 500;
  line-height: 1.4;
  padding: 4px 8px;
  border-radius: 4px;
  max-width: 300px;
  white-space: nowrap;
}

/* ---- 縦スクロール領域（VS Code WebView でも視認できる太さ） ---- */
.gv-scroll { scrollbar-width: auto; scrollbar-color: var(--gv-color-text-secondary) transparent; }
.gv-scroll::-webkit-scrollbar { width: 12px; height: 12px; }
.gv-scroll::-webkit-scrollbar-track { background: transparent; }
.gv-scroll::-webkit-scrollbar-thumb { background: var(--gv-color-divider); border-radius: 3px; }
.gv-scroll::-webkit-scrollbar-thumb:hover { background: var(--gv-color-text-secondary); }
`;

let injected = false;

/**
 * UI スタイルを `document.head` へ冪等注入する。SSR/非 DOM 環境では何もしない。
 * 各 UI primitive が render ごとに呼ぶため、2 回目以降はモジュールスコープの
 * boolean フラグで O(1) に短絡する（DOM 走査を避ける）。
 */
export function injectGraphUiStyles(): void {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
