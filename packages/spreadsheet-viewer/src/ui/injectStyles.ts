/**
 * spreadsheet-viewer 自前 UI キットのスタイルを実行時に注入する。
 *
 * CSS Modules を使わない理由: 消費先の一つ vscode-sheet-extension の webview webpack に
 * css-loader/style-loader が無く、`*.module.css` の import がビルドを壊すため。
 * 代わりに単一の `<style>` を冪等に注入する（バンドラ非依存・追加 devDep 不要）。
 *
 * 擬似要素（:hover / :focus-visible / ::-webkit-scrollbar）も実 CSS なので表現できる。
 * テーマ色は {@link themeCssVars} が UI ルート要素へ設定する `--sv-color-*` を参照する。
 */

const STYLE_ELEMENT_ID = "anytime-spreadsheet-ui-styles";

const CSS = `
.sv-root { color: var(--sv-color-text-primary); }

/* ホバーで action 背景を出す汎用ユーティリティ（タブ等） */
.sv-hoverable { transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1); }
.sv-hoverable:hover { background: var(--sv-color-action-hover); }

/* ---- Stack / Box は最小限。レイアウトは各コンポーネントの inline style で補う ---- */

/* ---- Text ---- */
.sv-text-caption {
  font-size: 0.75rem;
  line-height: 1.66;
  color: inherit;
}

/* ---- Button ---- */
.sv-btn {
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
  color: var(--sv-color-primary-main);
  transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}
.sv-btn--small { font-size: 0.75rem; padding: 3px 8px; min-height: 26px; }
.sv-btn--text:hover:not(:disabled) { background: var(--sv-color-action-hover); }
.sv-btn--outlined {
  background: transparent;
  border-color: var(--sv-color-divider);
  color: var(--sv-color-text-primary);
}
.sv-btn--outlined:hover:not(:disabled) { background: var(--sv-color-action-hover); }
.sv-btn--contained {
  background: var(--sv-color-primary-main);
  color: var(--sv-color-primary-contrast);
  border-color: transparent;
}
.sv-btn--contained:hover:not(:disabled) { filter: brightness(0.92); }
.sv-btn--inherit { color: var(--sv-color-text-primary); }
.sv-btn:disabled { opacity: 0.5; cursor: default; }
.sv-btn:focus-visible { outline: 2px solid var(--sv-color-primary-main); outline-offset: 1px; }

/* ---- IconButton ---- */
.sv-icon-btn {
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
.sv-icon-btn--small { padding: 4px; }
.sv-icon-btn:hover:not(:disabled) { background: var(--sv-color-action-hover); }
.sv-icon-btn:disabled { opacity: 0.38; cursor: default; }
.sv-icon-btn:focus-visible { outline: 2px solid var(--sv-color-primary-main); outline-offset: 1px; }

/* ---- Divider ---- */
.sv-divider { height: 1px; border: none; background: var(--sv-color-divider); margin: 4px 0; }

/* ---- Menu (anchorEl / anchorPosition) ---- */
/* z-index は app の最大ダイアログ（markdown 編集ダイアログ z-index:12000）より上にする。
   chart 表タブのコンテキストメニューが全画面ダイアログの背後に隠れるのを防ぐ。 */
.sv-menu-backdrop { position: fixed; inset: 0; z-index: 13000; }
.sv-menu-paper {
  position: fixed;
  z-index: 13001;
  box-sizing: border-box;
  min-width: 112px;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  padding: 4px 0;
  background: var(--sv-color-bg-paper);
  color: var(--sv-color-text-primary);
  border-radius: 4px;
  box-shadow: 0 5px 5px -3px rgba(0,0,0,.20), 0 8px 10px 1px rgba(0,0,0,.14), 0 3px 14px 2px rgba(0,0,0,.12);
  outline: none;
}
.sv-menu-item {
  display: flex;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  padding: 6px 16px;
  border: none;
  background: transparent;
  color: var(--sv-color-text-primary);
  font: inherit;
  font-size: 0.875rem;
  text-align: left;
  cursor: pointer;
}
.sv-menu-item:hover:not(:disabled) { background: var(--sv-color-action-hover); }
.sv-menu-item:disabled { opacity: 0.38; cursor: default; }
.sv-list-item-icon {
  display: inline-flex;
  align-items: center;
  min-width: 28px;
  color: var(--sv-color-text-secondary);
}
.sv-list-item-text { flex: 1 1 auto; }

/* ---- Select (native) ---- */
.sv-select {
  box-sizing: border-box;
  font: inherit;
  font-size: 0.8125rem;
  color: var(--sv-color-text-primary);
  background: transparent;
  border: 1px solid var(--sv-color-divider);
  border-radius: 4px;
  padding: 3px 6px;
  cursor: pointer;
}
.sv-select:focus-visible { outline: none; border-color: var(--sv-color-primary-main); }
.sv-select:disabled { opacity: 0.5; cursor: default; }

/* ---- TextField ---- */
.sv-textfield {
  box-sizing: border-box;
  font: inherit;
  color: var(--sv-color-text-primary);
  background: transparent;
  border: 1px solid var(--sv-color-divider);
  border-radius: 4px;
  padding: 6px 8px;
}
.sv-textfield:focus-visible { outline: none; border-color: var(--sv-color-primary-main); }

/* ---- Dialog ---- */
.sv-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.5);
}
.sv-dialog-paper {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-width: 320px;
  max-width: 90vw;
  max-height: 90vh;
  overflow: hidden;
  background: var(--sv-color-bg-paper);
  color: var(--sv-color-text-primary);
  border-radius: 4px;
  box-shadow: 0 8px 10px -5px rgba(0,0,0,.20), 0 16px 24px 2px rgba(0,0,0,.14), 0 6px 30px 5px rgba(0,0,0,.12);
}
.sv-dialog-title { padding: 16px 24px 8px; font-size: 1.25rem; font-weight: 600; }
.sv-dialog-content { padding: 8px 24px; overflow-y: auto; }
.sv-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 8px 12px; }

/* ---- Form ---- */
.sv-form-control { display: flex; flex-direction: column; }
.sv-form-label { margin-bottom: 4px; font-size: 0.875rem; color: var(--sv-color-text-secondary); }
.sv-form-control-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  color: var(--sv-color-text-primary);
}
.sv-radio { accent-color: var(--sv-color-primary-main); cursor: pointer; margin: 0; }

/* ---- ToggleButtonGroup ---- */
.sv-toggle-group { display: inline-flex; border: 1px solid var(--sv-color-divider); border-radius: 4px; overflow: hidden; }
.sv-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-left: 1px solid var(--sv-color-divider);
  background: transparent;
  color: var(--sv-color-text-secondary);
  cursor: pointer;
  padding: 4px 8px;
  font: inherit;
}
.sv-toggle-btn:first-child { border-left: none; }
.sv-toggle-btn:hover:not(:disabled) { background: var(--sv-color-action-hover); }
.sv-toggle-btn[aria-pressed="true"] { background: var(--sv-color-action-selected); color: var(--sv-color-primary-main); }
.sv-toggle-btn:disabled { opacity: 0.38; cursor: default; }

/* ---- Grid scroll container（スクロールバー擬似要素は実 CSS が必須） ---- */
.sv-grid-scroll { scrollbar-width: auto; scrollbar-color: var(--sv-sb-color); }
.sv-grid-scroll::-webkit-scrollbar { width: 12px; height: 12px; }
.sv-grid-scroll::-webkit-scrollbar-track { background: transparent; }
.sv-grid-scroll::-webkit-scrollbar-thumb { background: var(--sv-sb-thumb); border-radius: 3px; }
.sv-grid-scroll::-webkit-scrollbar-thumb:hover { background: var(--sv-sb-thumb-hover); }

/* ---- Tooltip ---- */
.sv-tooltip {
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
`;

/**
 * UI スタイルを `document.head` へ冪等注入する。SSR/非 DOM 環境では何もしない。
 * 複数の SpreadsheetEditor がマウントされても 1 度だけ注入される。
 */
export function injectSpreadsheetUiStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ELEMENT_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
