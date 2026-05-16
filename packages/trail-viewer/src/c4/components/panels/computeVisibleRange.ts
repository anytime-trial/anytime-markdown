/**
 * スクロール位置から可視 row の [startIndex, endIndex) を算出する純粋関数。
 *
 * - endIndex は exclusive。slice(startIndex, endIndex) で取り出せる
 * - overscan は上下に余分にレンダリングする row 数 (チラつき防止)
 * - total === 0 のとき [0, 0]
 * - rowHeight <= 0 のとき [0, total] (フォールバック: 全件レンダリング)
 */
export function computeVisibleRange(
  scrollTop: number,
  clientHeight: number,
  rowHeight: number,
  total: number,
  overscan = 10,
): readonly [startIndex: number, endIndex: number] {
  if (total === 0) return [0, 0];
  if (rowHeight <= 0) return [0, total];
  const safeScroll = Math.max(0, scrollTop);
  const start = Math.max(0, Math.floor(safeScroll / rowHeight) - overscan);
  const end = Math.min(total, Math.ceil((safeScroll + Math.max(0, clientHeight)) / rowHeight) + overscan);
  return [start, end];
}
