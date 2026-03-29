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
  | { readonly type: "row"; readonly row: number }
  | { readonly type: "col"; readonly col: number };

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

/** コンテキストメニューの状態 */
export interface ContextMenuState {
  readonly anchorX: number;
  readonly anchorY: number;
  readonly target:
    | { readonly type: "row"; readonly index: number }
    | { readonly type: "col"; readonly index: number };
}
