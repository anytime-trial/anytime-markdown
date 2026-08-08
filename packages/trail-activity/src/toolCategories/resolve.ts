/**
 * ツール名をカテゴリ番号に解決する。
 * 優先順位: 完全一致 → ワイルドカード前方一致（最長優先）→ '*'（その他）
 */
export function resolveToolCategory(toolName: string, map: ReadonlyMap<string, number>): number {
  const exact = map.get(toolName);
  if (exact !== undefined) return exact;

  let bestPrefixLen = -1;
  let bestCategory: number | undefined;
  for (const [pattern, category] of map) {
    if (pattern !== '*' && pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      if (toolName.startsWith(prefix) && prefix.length > bestPrefixLen) {
        bestPrefixLen = prefix.length;
        bestCategory = category;
      }
    }
  }
  if (bestCategory !== undefined) return bestCategory;

  return map.get('*') ?? 4;
}
