const DEFAULT_GRID = 20;

/** 値を最も近いグリッド倍数にスナップ */
export function snapToGrid(value: number, gridSize: number = DEFAULT_GRID): number {
  const result = Math.round(value / gridSize) * gridSize;
  return result === 0 ? 0 : result; // avoid -0
}

/** 矩形の位置（とオプションでサイズ）をグリッドにスナップ */
export function snapRect(
  x: number, y: number, width: number, height: number,
  gridSize: number = DEFAULT_GRID,
  snapSize: boolean = false,
): { x: number; y: number; width: number; height: number } {
  return {
    x: snapToGrid(x, gridSize),
    y: snapToGrid(y, gridSize),
    width: snapSize ? snapToGrid(width, gridSize) : width,
    height: snapSize ? snapToGrid(height, gridSize) : height,
  };
}
