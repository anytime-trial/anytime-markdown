const MUTATION_KEYWORDS = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE',
  'ALTER', 'TRUNCATE', 'REPLACE', 'ATTACH', 'DETACH',
  'REINDEX', 'VACUUM',
];

export function isMutationSql(sql: string): boolean {
  if (!sql) return false;
  const stripped = stripCommentsAndLeadingWith(sql).trimStart();
  if (!stripped) return false;
  const firstToken = stripped.split(/\s+/, 1)[0]?.toUpperCase() ?? '';
  return MUTATION_KEYWORDS.includes(firstToken);
}

function stripCommentsAndLeadingWith(sql: string): string {
  const s = sql.replace(/--[^\n]*\n?/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const withMatch = /^\s*WITH\s+/i.exec(s);
  if (withMatch) {
    let depth = 0;
    let i = withMatch[0].length;
    while (i < s.length) {
      const c = s[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (
        depth === 0 &&
        /\b(SELECT|INSERT|UPDATE|DELETE)\b/i.test(s.substring(i, i + 8))
      ) {
        return s.substring(i);
      }
      i++;
    }
  }
  return s;
}
