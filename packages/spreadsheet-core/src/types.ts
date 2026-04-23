/** セル選択の種類 */
export type SpreadsheetSelection =
  | { readonly type: "cell"; readonly row: number; readonly col: number }
  | {
      readonly type: "range";
      readonly startRow: number;
      readonly startCol: number;
      readonly endRow: number;
      readonly endCol: number;
    }
  | { readonly type: "row"; readonly start: number; readonly end: number }
  | { readonly type: "col"; readonly start: number; readonly end: number };

/** データ範囲（太枠） */
export interface DataRange {
  readonly rows: number;
  readonly cols: number;
}

/** セルの編集状態 */
export interface CellEditState {
  readonly row: number;
  readonly col: number;
  readonly value: string;
}

/** セルの配置 */
export type CellAlign = "left" | "center" | "right" | null;

/** 列フィルタの状態 */
export interface ColumnFilterState {
  /** フィルタ対象の列インデックス */
  readonly colIndex: number;
  /** 表示する値の集合（チェックされた値） */
  readonly selectedValues: ReadonlySet<string>;
}

/** コンテキストメニューの状態 */
export interface ContextMenuState {
  readonly anchorX: number;
  readonly anchorY: number;
  readonly target:
    | { readonly type: "row"; readonly index: number }
    | { readonly type: "col"; readonly index: number }
    | { readonly type: "cell"; readonly row: number; readonly col: number };
}

/** 表の完全状態の不変スナップショット */
export interface SheetSnapshot {
  readonly cells: ReadonlyArray<ReadonlyArray<string>>;
  readonly alignments: ReadonlyArray<ReadonlyArray<CellAlign>>;
  readonly range: DataRange;
}

/** 1シート分のデータ */
export interface SheetData {
  readonly name: string;
  readonly cells: ReadonlyArray<ReadonlyArray<string>>;
  readonly alignments: ReadonlyArray<ReadonlyArray<CellAlign>>;
  readonly range: DataRange;
}

/** ワークブック全体の不変スナップショット */
export interface WorkbookSnapshot {
  readonly sheets: ReadonlyArray<SheetData>;
  readonly activeSheet: number;
}
