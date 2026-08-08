import type BetterSqlite3 from 'better-sqlite3';

let cached: typeof BetterSqlite3 | null = null;

export function loadBetterSqlite3(): typeof BetterSqlite3 {
  if (cached) return cached;
  // bundle 環境では require のパスが不安定になるため、関数内で遅延 require
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  cached = require('better-sqlite3') as typeof BetterSqlite3;
  return cached;
}
