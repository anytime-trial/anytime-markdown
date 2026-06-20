/**
 * 脱React の vanilla DOM ファクトリ — Table（MUI Table / TableHead / TableRow / TableCell 置換）。
 *
 * 列定義（`TableColumn[]`）と行データ（`Record<string,string>[]`）から `<table>` を構築する。
 * React / MUI に依存せず、配色・境界は `--am-color-*` CSS 変数で追従する
 * （`Paper.ts` / `Dialog.ts` の cssText + CSS 変数パターンに従う）。
 *
 * controller 形（`{ el, update(rows), destroy() }`）で、行データの差し替えは `update` で
 * tbody のみ再構築する（thead は維持）。`size`（small / medium）でセル余白・フォントを切り替える。
 */

import { applyStyle } from "./dom";

/** 列の整列。MUI TableCell の `align` に対応。 */
export type TableCellAlign = "left" | "right" | "center";

/** 表のサイズ。MUI Table の `size` に対応（セル余白・フォントに影響）。 */
export type TableSize = "small" | "medium";

/** 列定義。`key` で行データを引き、`header` を見出しに表示する。 */
export interface TableColumn {
  /** 行データ（`Record<string,string>`）のキー。 */
  key: string;
  /** 見出しセルに表示するテキスト。 */
  header: string;
  /** セルの整列（見出し・本体の双方に適用）。既定 "left"。 */
  align?: TableCellAlign;
}

/** createTable のオプション。 */
export interface CreateTableOptions {
  /** 列定義。表示順はこの配列順。 */
  columns: ReadonlyArray<TableColumn>;
  /** 行データ（列 `key` → セル文字列）。欠損キーは空文字。 */
  rows: ReadonlyArray<Record<string, string>>;
  /** サイズ（セル余白・フォント）。既定 "medium"。 */
  size?: TableSize;
  /** 追加クラス名。 */
  className?: string;
  /** 追加スタイル（cssText の後に Object.assign で上書き）。 */
  style?: Partial<CSSStyleDeclaration>;
  /** data-testid 属性。 */
  testId?: string;
  /** テーブルの aria-label。 */
  ariaLabel?: string;
}

/** createTable の戻り値。tbody の差し替えと破棄を提供する。 */
export interface TableController {
  /** 生成された `<table>` 要素。 */
  el: HTMLTableElement;
  /** 行データを差し替えて tbody を再構築する（thead は維持）。 */
  update(rows: ReadonlyArray<Record<string, string>>): void;
  /** 要素を DOM から取り外す。 */
  destroy(): void;
}

/** サイズごとのセル余白（padding）。 */
function cellPadding(size: TableSize): string {
  return size === "small" ? "6px 8px" : "10px 16px";
}

/** サイズごとのフォントサイズ。 */
function cellFontSize(size: TableSize): string {
  return size === "small" ? "0.8125rem" : "0.875rem";
}

/** 見出しセル（`<th>`）の cssText。 */
function headCellCss(align: TableCellAlign, size: TableSize): string {
  return (
    `padding:${cellPadding(size)};` +
    `font-size:${cellFontSize(size)};` +
    "font-weight:600;" +
    `text-align:${align};` +
    "color:var(--am-color-text-secondary);" +
    "border-bottom:1px solid var(--am-color-divider);" +
    "white-space:nowrap;"
  );
}

/** 本体セル（`<td>`）の cssText。 */
function bodyCellCss(align: TableCellAlign, size: TableSize): string {
  return (
    `padding:${cellPadding(size)};` +
    `font-size:${cellFontSize(size)};` +
    `text-align:${align};` +
    "color:var(--am-color-text-primary);" +
    "border-bottom:1px solid var(--am-color-divider);"
  );
}

/** 行データ配列から tbody を構築する。 */
function buildBody(
  columns: ReadonlyArray<TableColumn>,
  rows: ReadonlyArray<Record<string, string>>,
  size: TableSize,
): HTMLTableSectionElement {
  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const col of columns) {
      const td = document.createElement("td");
      td.style.cssText = bodyCellCss(col.align ?? "left", size);
      td.textContent = row[col.key] ?? "";
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  return tbody;
}

/**
 * Table（`<table>`）を生成する。
 *
 * thead は列定義から一度だけ構築し、`update(rows)` では tbody のみ差し替える。
 */
export function createTable(opts: CreateTableOptions): TableController {
  const { columns } = opts;
  const size: TableSize = opts.size ?? "medium";

  const el = document.createElement("table");
  el.style.cssText =
    "width:100%;border-collapse:collapse;" +
    "background-color:var(--am-color-bg-paper);" +
    "color:var(--am-color-text-primary);";
  if (opts.ariaLabel) el.setAttribute("aria-label", opts.ariaLabel);
  if (opts.testId) el.setAttribute("data-testid", opts.testId);
  if (opts.className) el.className = opts.className;
  applyStyle(el, opts.style);

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const col of columns) {
    const th = document.createElement("th");
    th.scope = "col";
    th.style.cssText = headCellCss(col.align ?? "left", size);
    th.textContent = col.header;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  el.appendChild(thead);

  let tbody = buildBody(columns, opts.rows, size);
  el.appendChild(tbody);

  return {
    el,
    update(rows: ReadonlyArray<Record<string, string>>): void {
      const next = buildBody(columns, rows, size);
      el.replaceChild(next, tbody);
      tbody = next;
    },
    destroy(): void {
      el.remove();
    },
  };
}
