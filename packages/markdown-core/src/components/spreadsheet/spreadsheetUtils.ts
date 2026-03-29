/** グリッドの固定行数 */
export const GRID_ROWS = 100;

/** グリッドの固定列数 */
export const GRID_COLS = 20;

/** 列インデックスをアルファベットラベルに変換（0=A, 1=B, ...） */
export function columnLabel(index: number): string {
  return String.fromCharCode(65 + index);
}

/** 空のグリッドを生成 */
export function createEmptyGrid(): string[][] {
  return Array.from({ length: GRID_ROWS }, () =>
    Array.from({ length: GRID_COLS }, () => ""),
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
