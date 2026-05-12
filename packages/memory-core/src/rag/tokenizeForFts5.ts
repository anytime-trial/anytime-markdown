const FTS5_RESERVED = /[*^"():]/g;

function stripReserved(s: string): string {
  return s.replace(FTS5_RESERVED, '').trim();
}

export function tokenizeForFts5(query: string): string {
  if (!query) return '';
  const normalized = query.replace(/　/g, ' ').trim();
  if (!normalized) return '';

  const phrases: string[] = [];
  const remainder = normalized.replace(/"([^"]+)"/g, (_match, body: string) => {
    const cleaned = body.replace(FTS5_RESERVED, '').trim();
    if (cleaned) phrases.push(`"${cleaned}"`);
    return ' ';
  });

  const tokens = remainder
    .split(/\s+/)
    .map(stripReserved)
    .filter((t) => t.length >= 2)
    .map((t) => `"${t}"`);

  return [...phrases, ...tokens].join(' OR ');
}
