/**
 * tickets-viewer のスタイルを単一の `<style>` として冪等注入する（database-viewer と同方式）。
 *
 * CSS Modules を使わない理由: 消費側バンドラに css-loader を要求しないため。
 * テーマは web-app が `documentElement.dataset.theme` に設定する `data-theme` 属性へ追従し、
 * トークン値はデザインシステム（spec/10.web-app/design.md §2.2/§2.3）から導出する。
 */

const STYLE_ELEMENT_ID = "anytime-tickets-ui-styles";

const CSS = `
.tk-root {
  --tk-bg: #F2EFE8;
  --tk-paper: #FBF9F3;
  --tk-text: #1F1E1C;
  --tk-text-2: #5C5A55;
  --tk-divider: rgba(31, 30, 28, 0.12);
  --tk-hover: rgba(31, 30, 28, 0.04);
  --tk-selected: rgba(31, 30, 28, 0.08);
  /* 列（recessed）とカード（raised）の面。ライトはカードが一段白く浮く既存関係を維持 */
  --tk-column-bg: var(--tk-hover);
  --tk-card-bg: var(--tk-paper);
  --tk-card-border: var(--tk-divider);
  --tk-primary: #3D4A52;
  --tk-primary-contrast: #FBF9F3;
  --tk-success: #4B5A3E;
  --tk-error: #6B2A20;
  --tk-warning: #4A5A6B;
  --tk-info: #3D4A52;
  --tk-accent: #E8A012;
  --tk-accent-hover: #D4920E;
  --tk-radius-card: 12px;
  --tk-radius-control: 8px;
  color: var(--tk-text);
  font-size: 1rem;
  line-height: 1.5;
}
[data-theme="dark"] .tk-root {
  --tk-bg: #0D1117;
  --tk-paper: #121212;
  --tk-text: rgba(255, 255, 255, 0.87);
  --tk-text-2: rgba(255, 255, 255, 0.60);
  --tk-divider: rgba(255, 255, 255, 0.12);
  --tk-hover: rgba(255, 255, 255, 0.08);
  --tk-selected: rgba(255, 255, 255, 0.16);
  /* ダークは昇格を反転させない: 列を沈め（recessed）カードを一段明るく（raised）浮かせて可読に */
  --tk-column-bg: rgba(255, 255, 255, 0.03);
  --tk-card-bg: #1A202C;
  --tk-card-border: rgba(255, 255, 255, 0.16);
  --tk-primary: #90CAF9;
  --tk-primary-contrast: #0D1117;
  --tk-success: #66BB6A;
  --tk-error: #F44336;
  --tk-warning: #9B7BD8;
  --tk-info: #42A5F5;
}

/* ---- layout ---- */
.tk-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 0 16px; }
.tk-toolbar-spacer { flex: 1 1 auto; }
.tk-board { display: flex; gap: 12px; overflow-x: auto; align-items: flex-start; padding-bottom: 16px; }
.tk-column {
  flex: 0 0 272px;
  min-width: 272px;
  background: var(--tk-column-bg);
  border: 1px solid var(--tk-divider);
  border-radius: var(--tk-radius-card);
  padding: 8px;
}
.tk-column--over { outline: 2px solid var(--tk-accent); outline-offset: -2px; }
.tk-column-header { display: flex; align-items: center; gap: 8px; padding: 4px 8px 8px; font-weight: 600; font-size: 0.875rem; }
.tk-column-count { color: var(--tk-text-2); font-weight: 400; }
.tk-column-cards { display: flex; flex-direction: column; gap: 8px; min-height: 24px; }

/* ---- card ---- */
.tk-card {
  background: var(--tk-card-bg);
  border: 1px solid var(--tk-card-border);
  border-radius: var(--tk-radius-card);
  padding: 10px 12px;
  cursor: pointer;
  text-align: left;
  width: 100%;
  font: inherit;
  color: inherit;
  box-shadow: 0 3px 1px -2px rgba(0,0,0,.20), 0 2px 2px 0 rgba(0,0,0,.14), 0 1px 5px 0 rgba(0,0,0,.12);
  transition: box-shadow 250ms cubic-bezier(0.4, 0, 0.2, 1);
  touch-action: manipulation;
}
.tk-card:hover { box-shadow: 0 5px 5px -3px rgba(0,0,0,.20), 0 8px 10px 1px rgba(0,0,0,.14), 0 3px 14px 2px rgba(0,0,0,.12); }
.tk-card:focus-visible { outline: 2px solid var(--tk-primary); outline-offset: 1px; }
.tk-card--dragging { opacity: 0.4; }
.tk-card-id { font-size: 0.75rem; color: var(--tk-text-2); font-family: "Cascadia Code", "Fira Code", Menlo, monospace; }
.tk-card-title { font-size: 0.875rem; font-weight: 600; margin: 2px 0 6px; overflow-wrap: anywhere; }
.tk-card-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 0.75rem; color: var(--tk-text-2); }

/* ---- badges / chips ---- */
.tk-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 6px;
  padding: 1px 8px;
  font-size: 0.72rem;
  font-weight: 600;
  border: 1px solid currentColor;
  background: transparent;
}
.tk-badge--low { color: var(--tk-text-2); }
.tk-badge--medium { color: var(--tk-info); }
.tk-badge--high { color: var(--tk-warning); }
.tk-badge--urgent { color: var(--tk-error); }
.tk-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 6px;
  padding: 1px 6px;
  font-size: 0.72rem;
  background: var(--tk-selected);
  color: var(--tk-text-2);
}

/* ---- effort（実施/予定・分）とサブタスク完了数 ---- */
.tk-effort { display: inline-flex; align-items: center; gap: 6px; color: var(--tk-text-2); font-variant-numeric: tabular-nums; }

/* ---- buttons / inputs ---- */
.tk-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 6px 14px;
  border-radius: var(--tk-radius-control);
  border: 1px solid var(--tk-divider);
  background: transparent;
  color: var(--tk-primary);
  font: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  text-transform: none;
  cursor: pointer;
  transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}
.tk-btn:hover:not(:disabled) { background: var(--tk-hover); }
.tk-btn:disabled { opacity: 0.5; cursor: default; }
.tk-btn:focus-visible { outline: 2px solid var(--tk-primary); outline-offset: 1px; }
.tk-btn--primary {
  background: var(--tk-accent);
  border-color: transparent;
  color: #1F1E1C;
  font-weight: 600;
}
.tk-btn--primary:hover:not(:disabled) { background: var(--tk-accent-hover); }
.tk-btn--danger { color: var(--tk-error); }
.tk-btn--toggle-on { background: var(--tk-selected); border-color: var(--tk-primary); }
.tk-input, .tk-select, .tk-textarea {
  box-sizing: border-box;
  min-height: 36px;
  padding: 6px 10px;
  border-radius: var(--tk-radius-control);
  border: 1px solid var(--tk-divider);
  background: var(--tk-paper);
  color: var(--tk-text);
  font: inherit;
  font-size: 0.875rem;
}
.tk-input:focus-visible, .tk-select:focus-visible, .tk-textarea:focus-visible {
  outline: 2px solid var(--tk-primary);
  outline-offset: 1px;
}
.tk-textarea { min-height: 180px; width: 100%; resize: vertical; font-family: "Cascadia Code", "Fira Code", Menlo, monospace; line-height: 1.6; }
.tk-label { display: block; font-size: 0.75rem; color: var(--tk-text-2); margin-bottom: 2px; }
.tk-fieldset { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
/* フィルタ行右端のアーカイブ切替。select 群と下端を揃えるため min-height は .tk-select と同値 */
.tk-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 4px;
  font-size: 0.875rem;
  color: var(--tk-text);
  cursor: pointer;
}
.tk-checkbox input { width: 16px; height: 16px; margin: 0; accent-color: var(--tk-primary); cursor: pointer; }
.tk-checkbox input:focus-visible { outline: 2px solid var(--tk-primary); outline-offset: 1px; }

/* ---- list (table) ---- */
.tk-table-wrap { overflow-x: auto; border: 1px solid var(--tk-divider); border-radius: var(--tk-radius-card); }
.tk-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
.tk-table th, .tk-table td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--tk-divider); white-space: nowrap; }
.tk-table th { color: var(--tk-text-2); font-weight: 600; font-size: 0.75rem; }
.tk-table th button { background: none; border: none; color: inherit; font: inherit; cursor: pointer; padding: 4px; min-height: 28px; }
.tk-table tbody tr { cursor: pointer; }
.tk-table tbody tr:hover { background: var(--tk-hover); }
.tk-table td.tk-cell-title { white-space: normal; min-width: 200px; }

/* ---- dialog ---- */
.tk-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1300;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 32px 16px;
  overflow-y: auto;
}
.tk-dialog {
  background: var(--tk-paper);
  color: var(--tk-text);
  border: 1px solid var(--tk-divider);
  border-radius: var(--tk-radius-card);
  box-shadow: 0 8px 10px -5px rgba(0,0,0,.20), 0 16px 24px 2px rgba(0,0,0,.14), 0 6px 30px 5px rgba(0,0,0,.12);
  width: 100%;
  max-width: 720px;
  padding: 20px;
}
.tk-dialog-title { font-size: 1.25rem; font-weight: 700; margin: 0 0 12px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tk-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
.tk-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 12px; }

/* ---- notices ---- */
.tk-alert {
  border-radius: var(--tk-radius-control);
  border: 1px solid var(--tk-divider);
  padding: 10px 12px;
  margin: 8px 0;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.tk-alert--error { border-color: var(--tk-error); color: var(--tk-error); }
.tk-alert--warning { border-color: var(--tk-warning); color: var(--tk-warning); }
.tk-empty { color: var(--tk-text-2); text-align: center; padding: 48px 16px; }
.tk-deps { display: flex; flex-wrap: wrap; gap: 6px; }
.tk-link-btn { background: none; border: none; color: var(--tk-primary); font: inherit; cursor: pointer; text-decoration: underline; padding: 2px; }
.tk-link-btn:focus-visible { outline: 2px solid var(--tk-primary); outline-offset: 1px; }
.tk-comment { border-top: 1px solid var(--tk-divider); padding-top: 12px; margin-top: 16px; }
.tk-body-view { border: 1px solid var(--tk-divider); border-radius: var(--tk-radius-control); padding: 12px; overflow-x: auto; }
.tk-body-view pre { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; font-family: "Cascadia Code", "Fira Code", Menlo, monospace; font-size: 0.85rem; line-height: 1.6; }

@media (max-width: 600px) {
  /* ツールバー: スペーサを畳み、リポジトリ位置は 1 行占有で折返し可読に */
  .tk-toolbar { gap: 6px; padding: 6px 0 12px; }
  .tk-toolbar-spacer { display: none; }
  .tk-toolbar > .tk-card-meta { flex: 1 1 100%; overflow-wrap: anywhere; }
  /* ボード: ステータス列を縦積みにして全幅表示（横スクロール廃止・上から順に読ませる） */
  .tk-board { flex-direction: column; align-items: stretch; gap: 12px; overflow-x: visible; }
  .tk-column { flex: 1 1 auto; min-width: 0; width: 100%; }
  .tk-dialog { padding: 14px; }
  .tk-table th, .tk-table td { padding: 8px 10px; }
}
@media (pointer: coarse) {
  .tk-btn, .tk-input, .tk-select, .tk-checkbox { min-height: 44px; }
  .tk-checkbox input { width: 20px; height: 20px; }
}
@media (prefers-reduced-motion: reduce) {
  .tk-card, .tk-btn { transition-duration: 0.01ms; }
}
`;

/** `<style id="anytime-tickets-ui-styles">` を document.head へ冪等に注入する。 */
export function injectTicketsStyles(doc: Document = document): void {
  if (doc.getElementById(STYLE_ELEMENT_ID)) {
    return;
  }
  const style = doc.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
