export interface VisibleWindow {
  startIndex: number;
  endIndex: number;
  offsetY: number;
  totalHeight: number;
}

export function computeVisibleWindow(
  itemCount: number,
  rowHeight: number,
  scrollTop: number,
  viewportHeight: number,
  overscan: number,
): VisibleWindow {
  const safeItemCount = Math.max(0, Math.floor(itemCount));
  if (safeItemCount === 0 || rowHeight <= 0 || viewportHeight <= 0) {
    return { startIndex: 0, endIndex: 0, offsetY: 0, totalHeight: Math.max(0, safeItemCount * Math.max(0, rowHeight)) };
  }

  const safeScrollTop = Math.max(0, scrollTop);
  const safeOverscan = Math.max(0, Math.floor(overscan));
  const firstIntersecting = Math.min(safeItemCount - 1, Math.floor(safeScrollTop / rowHeight));
  const visibleRows = Math.max(1, Math.ceil(viewportHeight / rowHeight));
  const maxRows = visibleRows + 2 * safeOverscan + 1;
  const startIndex = Math.max(0, firstIntersecting - safeOverscan);
  const endIndex = Math.min(safeItemCount, startIndex + maxRows);

  return {
    startIndex,
    endIndex,
    offsetY: startIndex * rowHeight,
    totalHeight: safeItemCount * rowHeight,
  };
}
