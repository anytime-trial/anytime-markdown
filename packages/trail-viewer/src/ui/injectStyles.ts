/**
 * trail-viewer 自前 UI キットのスタイルを実行時に注入する。
 *
 * CSS Modules を使わない理由: 消費先の vscode-trail-extension の webview webpack に
 * css-loader/style-loader が無く、`*.module.css` の import がビルドを壊すため。
 * 代わりに単一の `<style>` を冪等に注入する（バンドラ非依存・追加 devDep 不要）。
 *
 * テーマ色は {@link applyTrailUiThemeVars} が documentElement へ設定する `--trv-color-*` を参照する。
 */

const STYLE_ELEMENT_ID = "anytime-trail-ui-styles";

const CSS = `
/* ---- Text / Typography ---- */
.trv-text { color: inherit; margin: 0; }
.trv-text-caption { font-size: 0.75rem; line-height: 1.66; color: inherit; }
.trv-text-subtitle1 { font-size: 1rem; font-weight: 400; line-height: 1.75; }
.trv-text-subtitle2 { font-size: 0.875rem; font-weight: 600; line-height: 1.57; }
.trv-text-body1 { font-size: 1rem; line-height: 1.5; }
.trv-text-body2 { font-size: 0.875rem; line-height: 1.43; }
.trv-text-overline { font-size: 0.75rem; font-weight: 400; letter-spacing: 0.08333em; text-transform: uppercase; line-height: 2.66; }
.trv-text-h6 { font-size: 1.25rem; font-weight: 500; line-height: 1.6; }
.trv-text-secondary { color: var(--trv-color-text-secondary); }
.trv-text-error { color: var(--trv-color-error-main); }
.trv-text-nowrap { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.trv-text-gutter { margin-bottom: 0.35em; }

/* ---- Button ---- */
.trv-btn {
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
  color: var(--trv-color-primary-main);
  transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}
.trv-btn--small { font-size: 0.75rem; padding: 3px 8px; min-height: 26px; }
.trv-btn--text:hover:not(:disabled) { background: var(--trv-color-action-hover); }
.trv-btn--outlined {
  border-color: var(--trv-color-primary-main);
  color: var(--trv-color-primary-main);
}
.trv-btn--outlined:hover:not(:disabled) { background: var(--trv-color-action-hover); }
.trv-btn--contained {
  background: var(--trv-color-primary-main);
  color: var(--trv-color-primary-contrast);
  border-color: transparent;
}
.trv-btn--contained:hover:not(:disabled) { filter: brightness(0.92); }
.trv-btn--error { color: var(--trv-color-error-main); }
.trv-btn--error.trv-btn--contained { background: var(--trv-color-error-main); color: #fff; }
.trv-btn--inherit { color: inherit; }
.trv-btn--fullwidth { width: 100%; }
.trv-btn:disabled { opacity: 0.5; cursor: default; }
.trv-btn:focus-visible { outline: 2px solid var(--trv-color-primary-main); outline-offset: 1px; }

/* ---- ButtonBase ---- */
.trv-btn-base {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border: none;
  padding: 0;
  margin: 0;
  background: transparent;
  cursor: pointer;
  text-decoration: none;
  color: inherit;
  font: inherit;
  -webkit-tap-highlight-color: transparent;
}
.trv-btn-base:disabled { cursor: default; pointer-events: none; }
.trv-btn-base:focus-visible { outline: 2px solid var(--trv-color-primary-main); outline-offset: 1px; }

/* ---- ButtonGroup ---- */
.trv-button-group {
  display: inline-flex;
  border-radius: 4px;
  box-shadow: none;
}
.trv-button-group .trv-btn {
  border-radius: 0;
  border-right-color: transparent;
}
.trv-button-group .trv-btn:first-child { border-radius: 4px 0 0 4px; }
.trv-button-group .trv-btn:last-child { border-radius: 0 4px 4px 0; border-right-color: var(--trv-color-primary-main); }
.trv-button-group--vertical { flex-direction: column; }
.trv-button-group--vertical .trv-btn { border-radius: 0; border-right-color: var(--trv-color-primary-main); border-bottom-color: transparent; }
.trv-button-group--vertical .trv-btn:first-child { border-radius: 4px 4px 0 0; }
.trv-button-group--vertical .trv-btn:last-child { border-radius: 0 0 4px 4px; border-bottom-color: var(--trv-color-primary-main); }

/* ---- IconButton ---- */
.trv-icon-btn {
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
.trv-icon-btn--small { padding: 4px; }
.trv-icon-btn:hover:not(:disabled) { background: var(--trv-color-action-hover); }
.trv-icon-btn:disabled { opacity: 0.38; cursor: default; }
.trv-icon-btn:focus-visible { outline: 2px solid var(--trv-color-primary-main); outline-offset: 1px; }

/* ---- Paper ---- */
.trv-paper {
  box-sizing: border-box;
  background: var(--trv-color-bg-paper);
  color: var(--trv-color-text-primary);
  border-radius: 4px;
  box-shadow: 0 2px 1px -1px rgba(0,0,0,.20), 0 1px 1px 0 rgba(0,0,0,.14), 0 1px 3px 0 rgba(0,0,0,.12);
}
.trv-paper--elevation0 { box-shadow: none; }
.trv-paper--elevation1 { box-shadow: 0 2px 1px -1px rgba(0,0,0,.20), 0 1px 1px 0 rgba(0,0,0,.14), 0 1px 3px 0 rgba(0,0,0,.12); }
.trv-paper--elevation2 { box-shadow: 0 3px 1px -2px rgba(0,0,0,.20), 0 2px 2px 0 rgba(0,0,0,.14), 0 1px 5px 0 rgba(0,0,0,.12); }
.trv-paper--outlined { box-shadow: none; border: 1px solid var(--trv-color-divider); }

/* ---- Divider ---- */
.trv-divider {
  border: none;
  border-top: 1px solid var(--trv-color-divider);
  margin: 0;
}
.trv-divider--vertical {
  border-top: none;
  border-left: 1px solid var(--trv-color-divider);
  height: auto;
  align-self: stretch;
  margin: 0;
}
.trv-divider--flex { flex: 1 1 auto; }

/* ---- Menu (anchorPosition / anchorEl) ---- */
.trv-menu-backdrop { position: fixed; inset: 0; z-index: 1300; }
.trv-menu-paper {
  position: fixed;
  box-sizing: border-box;
  min-width: 112px;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  padding: 4px 0;
  background: var(--trv-color-bg-paper);
  color: var(--trv-color-text-primary);
  border-radius: 4px;
  box-shadow: 0 5px 5px -3px rgba(0,0,0,.20), 0 8px 10px 1px rgba(0,0,0,.14), 0 3px 14px 2px rgba(0,0,0,.12);
  outline: none;
  z-index: 1301;
}
.trv-menu-item {
  display: flex;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  padding: 6px 16px;
  border: none;
  background: transparent;
  color: var(--trv-color-text-primary);
  font: inherit;
  font-size: 0.875rem;
  text-align: left;
  cursor: pointer;
}
.trv-menu-item:hover:not(:disabled) { background: var(--trv-color-action-hover); }
.trv-menu-item:disabled { opacity: 0.38; cursor: default; }

/* ---- List / ListItem / ListItemButton ---- */
.trv-list { list-style: none; margin: 0; padding: 0; }
.trv-list-item {
  display: flex;
  align-items: center;
  position: relative;
  box-sizing: border-box;
  padding: 8px 16px;
}
.trv-list-item--no-padding { padding: 0; }
.trv-list-item-icon {
  display: inline-flex;
  align-items: center;
  min-width: 28px;
  color: var(--trv-color-text-secondary);
}
.trv-list-item-text { flex: 1 1 auto; min-width: 0; }
.trv-list-item-button {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  box-sizing: border-box;
  padding: 4px 8px;
  border: none;
  background: transparent;
  color: var(--trv-color-text-primary);
  font: inherit;
  font-size: 0.875rem;
  text-align: left;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}
.trv-list-item-button:hover { background: var(--trv-color-action-hover); }
.trv-list-item-button.trv-selected { background: var(--trv-color-action-selected); }
.trv-list-item-button:focus-visible { outline: 2px solid var(--trv-color-primary-main); outline-offset: -2px; }

/* ---- TextField / TextareaAutosize ---- */
.trv-textfield {
  box-sizing: border-box;
  font: inherit;
  font-size: 0.8125rem;
  color: var(--trv-color-text-primary);
  background: transparent;
  border: 1px solid var(--trv-color-divider);
  border-radius: 4px;
  padding: 6px 8px;
}
.trv-textfield:focus-visible { outline: none; border-color: var(--trv-color-primary-main); }
.trv-textarea {
  box-sizing: border-box;
  width: 100%;
  resize: none;
  overflow: auto;
  font: inherit;
  color: var(--trv-color-text-primary);
  background: transparent;
  border: 1px solid var(--trv-color-divider);
  border-radius: 4px;
}
.trv-textarea:focus-visible { outline: none; border-color: var(--trv-color-primary-main); }

/* ---- Select ---- */
.trv-select {
  box-sizing: border-box;
  font: inherit;
  font-size: 0.875rem;
  color: var(--trv-color-text-primary);
  background: transparent;
  border: 1px solid var(--trv-color-divider);
  border-radius: 4px;
  padding: 6px 28px 6px 8px;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='%23888'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 4px center;
  cursor: pointer;
}
.trv-select--small { font-size: 0.8125rem; padding: 3px 24px 3px 6px; }
.trv-select:focus-visible { outline: none; border-color: var(--trv-color-primary-main); }
.trv-select:disabled { opacity: 0.5; cursor: default; }

/* ---- InputAdornment ---- */
.trv-input-adornment {
  display: inline-flex;
  align-items: center;
  color: var(--trv-color-text-secondary);
  font-size: 0.875rem;
  padding: 0 4px;
  white-space: nowrap;
}

/* ---- FormControl / InputLabel / FormLabel / FormControlLabel ---- */
.trv-form-control {
  display: inline-flex;
  flex-direction: column;
  position: relative;
  min-width: 0;
  vertical-align: top;
}
.trv-form-control--fullwidth { width: 100%; }
.trv-form-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 400;
  color: var(--trv-color-text-secondary);
  margin-bottom: 4px;
}
.trv-form-label--error { color: var(--trv-color-error-main); }
.trv-input-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--trv-color-text-secondary);
  margin-bottom: 2px;
  transform-origin: top left;
}
.trv-form-control-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 0.875rem;
  color: var(--trv-color-text-primary);
  user-select: none;
}
.trv-form-control-label--disabled { opacity: 0.5; cursor: default; }

/* ---- Chip ---- */
.trv-chip {
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  height: 24px;
  padding: 0 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  line-height: 1;
  background: var(--trv-color-action-selected);
  color: var(--trv-color-text-primary);
}
.trv-chip--small { height: 20px; font-size: 0.6875rem; }

/* ---- Switch ---- */
.trv-switch {
  display: inline-flex;
  align-items: center;
  position: relative;
  cursor: pointer;
  margin: 0;
}
.trv-switch input[type="checkbox"] { position: absolute; opacity: 0; width: 0; height: 0; }
.trv-switch-track {
  display: inline-block;
  width: 34px;
  height: 14px;
  border-radius: 7px;
  background: var(--trv-color-text-secondary);
  opacity: 0.38;
  transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}
.trv-switch--checked .trv-switch-track {
  background: var(--trv-color-primary-main);
  opacity: 0.5;
}
.trv-switch-thumb {
  position: absolute;
  top: 50%;
  left: 2px;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fafafa;
  box-shadow: 0 2px 1px -1px rgba(0,0,0,.20), 0 1px 1px 0 rgba(0,0,0,.14);
  transition: left 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}
.trv-switch--checked .trv-switch-thumb {
  left: calc(100% - 22px);
  background: var(--trv-color-primary-main);
}
.trv-switch--disabled { opacity: 0.5; cursor: default; pointer-events: none; }

/* ---- Checkbox ---- */
.trv-checkbox {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  cursor: pointer;
  color: var(--trv-color-text-secondary);
  border-radius: 50%;
  transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}
.trv-checkbox:hover:not(.trv-checkbox--disabled) { background: var(--trv-color-action-hover); }
.trv-checkbox--checked { color: var(--trv-color-primary-main); }
.trv-checkbox--disabled { opacity: 0.38; cursor: default; }
.trv-checkbox input[type="checkbox"] { position: absolute; opacity: 0; width: 0; height: 0; }

/* ---- Radio ---- */
.trv-radio {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  cursor: pointer;
  color: var(--trv-color-text-secondary);
  border-radius: 50%;
  transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}
.trv-radio:hover:not(.trv-radio--disabled) { background: var(--trv-color-action-hover); }
.trv-radio--checked { color: var(--trv-color-primary-main); }
.trv-radio--disabled { opacity: 0.38; cursor: default; }
.trv-radio input[type="radio"] { position: absolute; opacity: 0; width: 0; height: 0; }

/* ---- Tabs / Tab ---- */
.trv-tabs {
  display: flex;
  align-items: center;
  min-height: 32px;
  overflow-x: auto;
  scrollbar-width: none;
}
.trv-tabs::-webkit-scrollbar { height: 0; }
.trv-tab {
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--trv-color-text-secondary);
  font: inherit;
  font-size: 0.875rem;
  text-transform: none;
  padding: 6px 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}
.trv-tab:hover { color: var(--trv-color-text-primary); }
.trv-tab.trv-selected { color: var(--trv-color-primary-main); border-bottom-color: var(--trv-color-primary-main); }
.trv-tab:focus-visible { outline: 2px solid var(--trv-color-primary-main); outline-offset: -2px; }

/* ---- ToggleButton / ToggleButtonGroup ---- */
.trv-toggle-group {
  display: inline-flex;
  border-radius: 4px;
  border: 1px solid var(--trv-color-divider);
}
.trv-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border: none;
  border-right: 1px solid var(--trv-color-divider);
  background: transparent;
  color: var(--trv-color-text-secondary);
  font: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  padding: 7px 11px;
  cursor: pointer;
  transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), color 150ms;
}
.trv-toggle-btn:last-child { border-right: none; }
.trv-toggle-btn:hover:not(:disabled) { background: var(--trv-color-action-hover); color: var(--trv-color-text-primary); }
.trv-toggle-btn.trv-selected { background: var(--trv-color-action-selected); color: var(--trv-color-primary-main); }
.trv-toggle-btn--small { padding: 4px 8px; font-size: 0.8125rem; }
.trv-toggle-btn:disabled { opacity: 0.38; cursor: default; }

/* ---- Alert ---- */
.trv-alert {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  gap: 8px;
  padding: 6px 16px;
  border-radius: 4px;
  font-size: 0.875rem;
  line-height: 1.43;
}
.trv-alert--error { color: var(--trv-color-error-main); background: color-mix(in srgb, var(--trv-color-error-main) 12%, transparent); }
.trv-alert--warning { color: var(--trv-color-warning-main); background: color-mix(in srgb, var(--trv-color-warning-main) 12%, transparent); }
.trv-alert--info { color: var(--trv-color-info-main); background: color-mix(in srgb, var(--trv-color-info-main) 12%, transparent); }
.trv-alert--success { color: var(--trv-color-success-main); background: color-mix(in srgb, var(--trv-color-success-main) 12%, transparent); }

/* ---- Tooltip ---- */
.trv-tooltip {
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

/* ---- CircularProgress ---- */
@keyframes trv-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.trv-circular-progress {
  display: inline-block;
  animation: trv-spin 1.4s linear infinite;
  color: var(--trv-color-primary-main);
}
.trv-circular-progress svg { display: block; }

/* ---- LinearProgress ---- */
@keyframes trv-linear-indeterminate1 {
  0% { left: -35%; right: 100%; }
  60% { left: 100%; right: -90%; }
  100% { left: 100%; right: -90%; }
}
@keyframes trv-linear-indeterminate2 {
  0% { left: -200%; right: 100%; }
  60% { left: 107%; right: -8%; }
  100% { left: 107%; right: -8%; }
}
.trv-linear-progress {
  position: relative;
  overflow: hidden;
  height: 4px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--trv-color-primary-main) 24%, transparent);
}
.trv-linear-progress-bar {
  position: absolute;
  top: 0;
  bottom: 0;
  background: var(--trv-color-primary-main);
  border-radius: inherit;
  transition: transform 0.2s linear;
  transform-origin: left;
}
.trv-linear-progress-bar--indeterminate1 {
  animation: trv-linear-indeterminate1 2.1s cubic-bezier(0.65, 0.815, 0.735, 0.395) infinite;
  width: auto;
  left: 0;
  right: 0;
}
.trv-linear-progress-bar--indeterminate2 {
  animation: trv-linear-indeterminate2 2.1s cubic-bezier(0.165, 0.84, 0.44, 1) 1.15s infinite;
  width: auto;
  left: 0;
  right: 0;
}

/* ---- Skeleton ---- */
@keyframes trv-pulse {
  0% { opacity: 1; }
  50% { opacity: 0.4; }
  100% { opacity: 1; }
}
.trv-skeleton {
  display: block;
  background: color-mix(in srgb, var(--trv-color-text-primary) 11%, transparent);
  border-radius: 4px;
  animation: trv-pulse 2s ease-in-out 0.5s infinite;
}
.trv-skeleton--text { border-radius: 4px; height: 1.2em; margin: 0; }
.trv-skeleton--circular { border-radius: 50%; }
.trv-skeleton--rectangular { border-radius: 0; }
.trv-skeleton--no-animation { animation: none; }

/* ---- Slider ---- */
.trv-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--trv-color-primary-main) 24%, transparent);
  outline: none;
  cursor: pointer;
  accent-color: var(--trv-color-primary-main);
}
.trv-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--trv-color-primary-main);
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
}
.trv-slider:focus-visible { outline: 2px solid var(--trv-color-primary-main); outline-offset: 2px; }

/* ---- Dialog ---- */
.trv-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1300;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}
.trv-dialog-paper {
  position: relative;
  box-sizing: border-box;
  background: var(--trv-color-bg-paper);
  color: var(--trv-color-text-primary);
  border-radius: 4px;
  box-shadow: 0 11px 15px -7px rgba(0,0,0,.20), 0 24px 38px 3px rgba(0,0,0,.14), 0 9px 46px 8px rgba(0,0,0,.12);
  outline: none;
  min-width: 280px;
  max-width: calc(100vw - 64px);
  max-height: calc(100vh - 64px);
  overflow-y: auto;
}
.trv-dialog-title {
  padding: 16px 24px;
  font-size: 1.25rem;
  font-weight: 500;
  line-height: 1.6;
  margin: 0;
}
.trv-dialog-content {
  padding: 8px 24px 20px;
  overflow-y: auto;
}
.trv-dialog-content--dividers {
  border-top: 1px solid var(--trv-color-divider);
  border-bottom: 1px solid var(--trv-color-divider);
  padding: 16px 24px;
}
.trv-dialog-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px;
}

/* ---- Table ---- */
.trv-table-container { overflow-x: auto; }
.trv-table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.875rem;
}
.trv-th {
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  border-bottom: 1px solid var(--trv-color-divider);
  color: var(--trv-color-text-primary);
  white-space: nowrap;
}
.trv-td {
  padding: 8px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--trv-color-divider) 50%, transparent);
  color: var(--trv-color-text-primary);
}
.trv-th--numeric, .trv-td--numeric { text-align: right; }

/* ---- Avatar ---- */
.trv-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--trv-color-action-selected);
  color: var(--trv-color-text-primary);
  font-size: 1.25rem;
  font-weight: 400;
  user-select: none;
}
.trv-avatar--small { width: 24px; height: 24px; font-size: 0.75rem; }
.trv-avatar--large { width: 56px; height: 56px; font-size: 1.5rem; }
.trv-avatar--rounded { border-radius: 4px; }
.trv-avatar--square { border-radius: 0; }
.trv-avatar img { width: 100%; height: 100%; object-fit: cover; }

/* ---- Toolbar ---- */
.trv-toolbar {
  display: flex;
  align-items: center;
  min-height: 56px;
  padding: 0 16px;
  box-sizing: border-box;
}
.trv-toolbar--dense { min-height: 48px; }
.trv-toolbar--no-gutters { padding: 0; }

/* ---- Rating ---- */
.trv-rating {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.trv-rating-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 1px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--trv-color-warning-main, #f5a623);
  font-size: 1.5rem;
  line-height: 1;
  transition: color 150ms;
}
.trv-rating-btn:focus-visible { outline: 2px solid var(--trv-color-primary-main); outline-offset: 1px; }
.trv-rating--readonly .trv-rating-btn { cursor: default; }
.trv-rating--small .trv-rating-btn { font-size: 1.25rem; }
.trv-rating--large .trv-rating-btn { font-size: 2rem; }

/* ---- Scroll utility ---- */
.trv-scroll { scrollbar-width: auto; scrollbar-color: var(--trv-color-text-secondary) transparent; }
.trv-scroll::-webkit-scrollbar { width: 12px; height: 12px; }
.trv-scroll::-webkit-scrollbar-track { background: transparent; }
.trv-scroll::-webkit-scrollbar-thumb { background: var(--trv-color-divider); border-radius: 3px; }
.trv-scroll::-webkit-scrollbar-thumb:hover { background: var(--trv-color-text-secondary); }
`;

/**
 * UI スタイルを `document.head` へ冪等注入する。SSR/非 DOM 環境では何もしない。
 * 複数の TrailViewer コンポーネントがマウントされても 1 度だけ注入される。
 */
export function injectTrailUiStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ELEMENT_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
