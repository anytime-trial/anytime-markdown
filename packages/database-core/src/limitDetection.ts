// 入力は trim 済みのため末尾に空白は残らない。末尾 `\s*;?\s*$` の二重 `\s*` は
// 量指定子の曖昧性 (js/polynomial-redos / S5852) を生むので、末尾 `\s*` を落として
// 単一の `\s*;?$` にする (`;` 直前の空白のみ許容)。
const TRAILING_LIMIT = /\blimit\s+\d+(?:\s+offset\s+\d+)?\s*;?$/i;

export function hasTopLevelLimit(sql: string): boolean {
  if (!sql) return false;
  const trimmed = sql.trim();
  if (!TRAILING_LIMIT.test(trimmed)) return false;
  const lastOpen = trimmed.lastIndexOf('(');
  const lastClose = trimmed.lastIndexOf(')');
  return lastOpen <= lastClose;
}
