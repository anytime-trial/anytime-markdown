/**
 * 識別子（camelCase / PascalCase / snake_case / kebab-case / パス / ドット区切り /
 * 数字境界）を検索可能なサブトークンへ分割する（B1。memory-core spec §7.4）。
 *
 * FTS5 unicode61 は `useBlockAlignment` を 1 トークンとして索引するため、
 * `blockAlignment` のような部分識別子クエリが届かない。索引側（aliases_text）と
 * クエリ側（tokenizeForFts5）の両方が本関数の分割を共有することで一致させる。
 */

const SEGMENT_SEPARATORS = /[/\\._\-\s]+/;
const ASCII_IDENTIFIER = /^[A-Za-z0-9]+$/;

function splitCamelAndDigits(segment: string): string[] {
  return segment
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([A-Za-z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([A-Za-z])/g, '$1 $2')
    .split(' ')
    .filter((p) => p.length > 0);
}

export function splitIdentifierSubtokens(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const segment of trimmed.split(SEGMENT_SEPARATORS)) {
    // 非 ASCII セグメント（日本語等）は unicode61 がそのまま索引するため分割しない
    if (!segment || !ASCII_IDENTIFIER.test(segment)) continue;
    for (const part of splitCamelAndDigits(segment)) {
      const lower = part.toLowerCase();
      if (lower.length < 2 || seen.has(lower)) continue;
      seen.add(lower);
      out.push(lower);
    }
  }
  // 分割点が無く元文字列がそのまま残っただけなら、追加語彙としての価値が無い
  if (out.length === 1 && out[0] === trimmed.toLowerCase()) return [];
  return out;
}
