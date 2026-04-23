/** グリッドのデフォルト行数 */
export const DEFAULT_GRID_ROWS = 51;

/** グリッドのデフォルト列数 */
export const DEFAULT_GRID_COLS = 15;

/** 列インデックスをアルファベットラベルに変換（0=A, 1=B, ...） */
export function columnLabel(index: number): string {
  return String.fromCharCode(65 + index);
}

/** 空のグリッドを生成 */
export function createEmptyGrid(rows = DEFAULT_GRID_ROWS, cols = DEFAULT_GRID_COLS): string[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ""),
  );
}

/** 指定セルがデータ範囲内かを判定 */
export function isInDataRange(
  row: number,
  col: number,
  range: { rows: number; cols: number },
): boolean {
  return row >= 0 && row < range.rows && col >= 0 && col < range.cols;
}
