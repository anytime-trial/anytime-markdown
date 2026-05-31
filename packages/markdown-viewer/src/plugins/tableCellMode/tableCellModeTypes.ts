export type TableCellMode = "navigation" | "editing";

export interface TableCellModeState {
  /** 現在のモード */
  readonly mode: TableCellMode;
  /** navigation モードで選択中のセル位置（ドキュメント内 pos） */
  readonly selectedCellPos: number | null;
  /** editing モードに入った時点のセル位置 */
  readonly editingCellPos: number | null;
}

export const INITIAL_STATE: Readonly<TableCellModeState> = {
  mode: "navigation",
  selectedCellPos: null,
  editingCellPos: null,
};
