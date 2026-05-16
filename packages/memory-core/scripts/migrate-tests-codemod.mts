#!/usr/bin/env -S node --experimental-strip-types
/**
 * memory-core __tests__ 配下のテストで sql.js Database を直接使っている箇所を
 * SqlJsMemoryDb.fromDatabase() でラップして MemoryDbConnection IF に統一する codemod。
 *
 * 変換:
 *   - `new SQL.Database()` → `SqlJsMemoryDb.fromDatabase(new SQL.Database())`
 *   - `new SQL.Database(bytes)` → `SqlJsMemoryDb.fromDatabase(new SQL.Database(bytes))`
 *   - `Database` 型注釈 → `SqlJsMemoryDb` (SqlJsMemoryDb は MemoryDbConnection 互換 + exportBytes)
 *   - `db.export()` → `db.exportBytes()`
 *   - SqlJsMemoryDb import を自動追加
 *
 * `import type { Database } from 'sql.js'` 等の import 文は残す
 * (テスト内で型注釈以外 — 例えば `let db: Database` — に使われている場合もあるが、
 * 上記置換で SqlJsMemoryDb に切替わるため、未使用 import は tsc が許容する)。
 */
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const TESTS_ROOT = path.join(PROJECT_ROOT, '__tests__');
const SQLJSMEMORYDB_PATH = path.join(PROJECT_ROOT, 'src', 'db', 'connection', 'SqlJsMemoryDb.ts');

const EXCLUDE_PATTERNS = [
  /__tests__\/db\/connection\//, // 新規 connection テストは対象外
];

function* walk(dir: string): IterableIterator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (entry.isFile() && p.endsWith('.test.ts')) yield p;
  }
}

function relativeImport(fromFile: string): string {
  const dir = path.dirname(fromFile);
  const rel = path.relative(dir, SQLJSMEMORYDB_PATH).replace(/\\/g, '/').replace(/\.ts$/, '');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

let touched = 0;

for (const file of walk(TESTS_ROOT)) {
  if (EXCLUDE_PATTERNS.some((re) => re.test(file))) continue;

  const original = fs.readFileSync(file, 'utf8');
  let updated = original;

  const usesNewSqlDatabase = /new\s+SQL\.Database\b/.test(updated);
  if (!usesNewSqlDatabase) continue;

  // 1. `new SQL.Database(...)` → `SqlJsMemoryDb.fromDatabase(new SQL.Database(...))`
  //    （二重ラップを防ぐため、既に fromDatabase で囲まれていないか確認）
  updated = updated.replace(
    /(?<!SqlJsMemoryDb\.fromDatabase\()new\s+SQL\.Database\(([^)]*)\)/g,
    'SqlJsMemoryDb.fromDatabase(new SQL.Database($1))',
  );

  // 2. SqlJsMemoryDb の import 追加 (まだ無い場合)
  if (!/from\s+['"][^'"]+\/SqlJsMemoryDb['"]/.test(updated)) {
    const importPath = relativeImport(file);
    const newImport = `import { SqlJsMemoryDb } from '${importPath}';\n`;
    // 既存 import の直後に挿入
    const firstImportMatch = /^(import[^\n]*\n)/m.exec(updated);
    if (firstImportMatch) {
      const insertAt = firstImportMatch.index + firstImportMatch[0].length;
      updated = updated.slice(0, insertAt) + newImport + updated.slice(insertAt);
    } else {
      updated = newImport + updated;
    }
  }

  // 3. `db.export()` → `db.exportBytes()` (sql.js の export() メソッド名衝突)
  updated = updated.replace(/\.export\(\)/g, '.exportBytes()');

  // 4. 型注釈 `: Database` → `: SqlJsMemoryDb`
  updated = updated.replace(
    /:\s*Database(?![A-Za-z0-9_$])/g,
    ': SqlJsMemoryDb',
  );

  if (updated !== original) {
    fs.writeFileSync(file, updated);
    touched++;
    console.log(`  modified: ${path.relative(PROJECT_ROOT, file)}`);
  }
}

console.log(`\nTouched ${touched} test files`);
