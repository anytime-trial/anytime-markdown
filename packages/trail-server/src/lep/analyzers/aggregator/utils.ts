// Layer 4 (Aggregator) の純粋関数が共有する小ユーティリティ。
// computeDoraMetrics / computeCrossSourceCorrelations から import する。

/** key 関数でグルーピングして Map<key, items[]> を返す。 */
export function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const arr = map.get(k);
    if (arr) arr.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/** 辞書順比較 (ISO 8601 文字列の昇順ソートに使う。localeCompare は意図的に使わない)。 */
export function compareStr(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** 中央値。空配列は呼び出し側でガードする前提 (空なら NaN)。 */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
