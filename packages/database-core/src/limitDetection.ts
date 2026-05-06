const TRAILING_LIMIT = /\blimit\s+\d+\b\s*(offset\s+\d+)?\s*;?\s*$/i;

export function hasTopLevelLimit(sql: string): boolean {
  if (!sql) return false;
  const trimmed = sql.trim();
  if (!TRAILING_LIMIT.test(trimmed)) return false;
  const lastOpen = trimmed.lastIndexOf('(');
  const lastClose = trimmed.lastIndexOf(')');
  return lastOpen <= lastClose;
}
