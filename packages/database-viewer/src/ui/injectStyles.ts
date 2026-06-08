/**
 * database-viewer 自前 UI キットのスタイルを実行時に注入する。
 *
 * CSS Modules を使わない理由: 消費先の vscode-database-extension の webview webpack に
 * css-loader/style-loader が無く、`*.module.css` の import がビルドを壊すため。
 * 代わりに単一の `<style>` を冪等に注入する（バンドラ非依存・追加 devDep 不要）。
 *
 * 擬似要素（:hover / :focus-visible / ::-webkit-scrollbar）も実 CSS なので表現できる。
 * テーマ色は {@link themeCssVars} が documentElement へ設定する `--dbv-color-*` を参照する。
 */

const STYLE_ELEMENT_ID = "anytime-database-ui-styles";

const CSS = `
/* ---- Text ---- */
.dbv-text { color: inherit; margin: 0; }
.dbv-text-caption { font-size: 0.75rem; line-height: 1.66; color: inherit; }
.dbv-text-subtitle2 { font-size: 0.875rem; font-weight: 600; line-height: 1.57; }
.dbv-text-secondary { color: var(--dbv-color-text-secondary); }
.dbv-text-error { color: var(--dbv-color-error-main); }

/* ---- Button ---- */
.dbv-btn {
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
  color: var(--dbv-color-primary-main);
  transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}
.dbv-btn--small { font-size: 0.75rem; padding: 3px 8px; min-height: 26px; }
.dbv-btn--text:hover:not(:disabled) { background: var(--dbv-color-action-hover); }
.dbv-btn--contained {
  background: var(--dbv-color-primary-main);
  color: var(--dbv-color-primary-contrast);
  border-color: transparent;
}
.dbv-btn--contained:hover:not(:disabled) { filter: brightness(0.92); }
.dbv-btn:disabled { opacity: 0.5; cursor: default; }
.dbv-btn:focus-visible { outline: 2px solid var(--dbv-color-primary-main); outline-offset: 1px; }

/* ---- IconButton ---- */
.dbv-icon-btn {
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
.dbv-icon-btn--small { padding: 4px; }
.dbv-icon-btn:hover:not(:disabled) { background: var(--dbv-color-action-hover); }
.dbv-icon-btn:disabled { opacity: 0.38; cursor: default; }
.dbv-icon-btn:focus-visible { outline: 2px solid var(--dbv-color-primary-main); outline-offset: 1px; }

/* ---- Menu (anchorPosition) ---- */
.dbv-menu-backdrop { position: fixed; inset: 0; z-index: 1300; }
.dbv-menu-paper {
  position: fixed;
  box-sizing: border-box;
  min-width: 112px;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  padding: 4px 0;
  background: var(--dbv-color-bg-paper);
  color: var(--dbv-color-text-primary);
  border-radius: 4px;
  box-shadow: 0 5px 5px -3px rgba(0,0,0,.20), 0 8px 10px 1px rgba(0,0,0,.14), 0 3px 14px 2px rgba(0,0,0,.12);
  outline: none;
}
.dbv-menu-item {
  display: flex;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  padding: 6px 16px;
  border: none;
  background: transparent;
  color: var(--dbv-color-text-primary);
  font: inherit;
  font-size: 0.875rem;
  text-align: left;
  cursor: pointer;
}
.dbv-menu-item:hover:not(:disabled) { background: var(--dbv-color-action-hover); }
.dbv-menu-item:disabled { opacity: 0.38; cursor: default; }
.dbv-list-item-icon {
  display: inline-flex;
  align-items: center;
  min-width: 28px;
  color: var(--dbv-color-text-secondary);
}
.dbv-list-item-text { flex: 1 1 auto; min-width: 0; }

/* ---- TextField ---- */
.dbv-textfield {
  box-sizing: border-box;
  font: inherit;
  font-size: 0.8125rem;
  color: var(--dbv-color-text-primary);
  background: transparent;
  border: 1px solid var(--dbv-color-divider);
  border-radius: 4px;
  padding: 6px 8px;
}
.dbv-textfield:focus-visible { outline: none; border-color: var(--dbv-color-primary-main); }

/* ---- TextareaAutosize ---- */
.dbv-textarea {
  box-sizing: border-box;
  width: 100%;
  resize: none;
  overflow: auto;
  font: inherit;
  color: var(--dbv-color-text-primary);
  background: transparent;
  border: 1px solid var(--dbv-color-divider);
  border-radius: 4px;
}
.dbv-textarea:focus-visible { outline: none; border-color: var(--dbv-color-primary-main); }

/* ---- List / ListItemButton ---- */
.dbv-list { list-style: none; margin: 0; padding: 0; }
.dbv-list-item-button {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  box-sizing: border-box;
  padding: 4px 8px;
  border: none;
  background: transparent;
  color: var(--dbv-color-text-primary);
  font: inherit;
  font-size: 0.875rem;
  text-align: left;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}
.dbv-list-item-button:hover { background: var(--dbv-color-action-hover); }
.dbv-list-item-button.dbv-selected { background: var(--dbv-color-action-selected); }
.dbv-list-item-button:focus-visible { outline: 2px solid var(--dbv-color-primary-main); outline-offset: -2px; }

/* ---- Chip ---- */
.dbv-chip {
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  height: 24px;
  padding: 0 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  line-height: 1;
  background: var(--dbv-color-action-selected);
  color: var(--dbv-color-text-primary);
}
.dbv-chip--small { height: 20px; font-size: 0.6875rem; }

/* ---- Tabs / Tab ---- */
.dbv-tabs {
  display: flex;
  align-items: center;
  min-height: 32px;
  overflow-x: auto;
  scrollbar-width: none;
}
.dbv-tabs::-webkit-scrollbar { height: 0; }
.dbv-tab {
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--dbv-color-text-secondary);
  font: inherit;
  font-size: 0.875rem;
  text-transform: none;
  padding: 6px 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}
.dbv-tab:hover { color: var(--dbv-color-text-primary); }
.dbv-tab.dbv-selected { color: var(--dbv-color-primary-main); border-bottom-color: var(--dbv-color-primary-main); }
.dbv-tab:focus-visible { outline: 2px solid var(--dbv-color-primary-main); outline-offset: -2px; }

/* ---- Alert ---- */
.dbv-alert {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  gap: 8px;
  padding: 6px 16px;
  border-radius: 4px;
  font-size: 0.875rem;
  line-height: 1.43;
}
.dbv-alert--error { color: var(--dbv-color-error-main); background: color-mix(in srgb, var(--dbv-color-error-main) 12%, transparent); }
.dbv-alert--warning { color: var(--dbv-color-warning-main); background: color-mix(in srgb, var(--dbv-color-warning-main) 12%, transparent); }
.dbv-alert--info { color: var(--dbv-color-info-main); background: color-mix(in srgb, var(--dbv-color-info-main) 12%, transparent); }
.dbv-alert--success { color: var(--dbv-color-success-main); background: color-mix(in srgb, var(--dbv-color-success-main) 12%, transparent); }

/* ---- Tooltip ---- */
.dbv-tooltip {
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
.dbv-scroll { scrollbar-width: auto; scrollbar-color: var(--dbv-color-text-secondary) transparent; }
.dbv-scroll::-webkit-scrollbar { width: 12px; height: 12px; }
.dbv-scroll::-webkit-scrollbar-track { background: transparent; }
.dbv-scroll::-webkit-scrollbar-thumb { background: var(--dbv-color-divider); border-radius: 3px; }
.dbv-scroll::-webkit-scrollbar-thumb:hover { background: var(--dbv-color-text-secondary); }
`;

/**
 * UI スタイルを `document.head` へ冪等注入する。SSR/非 DOM 環境では何もしない。
 * 複数の DatabaseEditor がマウントされても 1 度だけ注入される。
 */
export function injectDatabaseUiStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ELEMENT_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
