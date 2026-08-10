import { splitIdentifierSubtokens } from './identifierTokens';

const FTS5_RESERVED = /[*^"():]/g;
const IDENTIFIER_TOKEN = /^[A-Za-z0-9_./\\-]+$/;

function stripReserved(s: string): string {
  return s.replace(FTS5_RESERVED, '').trim();
}

export function tokenizeForFts5(query: string): string {
  if (!query) return '';
  const normalized = query.replaceAll('　', ' ').trim();
  if (!normalized) return '';

  const phrases: string[] = [];
  const remainder = normalized.replace(/"([^"]+)"/g, (_match, body: string) => {
    const cleaned = body.replace(FTS5_RESERVED, '').trim();
    if (cleaned) phrases.push(`"${cleaned}"`);
    return ' ';
  });

  const seen = new Set<string>();
  const tokens: string[] = [];
  const push = (term: string): void => {
    const quoted = `"${term}"`;
    if (seen.has(quoted)) return;
    seen.add(quoted);
    tokens.push(quoted);
  };
  for (const raw of remainder.split(/\s+/)) {
    const t = stripReserved(raw);
    if (t.length < 2) continue;
    push(t);
    // B1: 識別子形トークンは分割サブトークンでも索引に届くようにする
    // （unicode61 は camelCase を割らないため、索引側 aliases_text と対で効く）
    if (IDENTIFIER_TOKEN.test(t)) {
      for (const sub of splitIdentifierSubtokens(t)) push(sub);
    }
  }

  return [...phrases, ...tokens].join(' OR ');
}
