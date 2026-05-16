#!/usr/bin/env -S node --experimental-strip-types
/**
 * テスト内で `db: Database` (sql.js) を使っているヘルパ関数引数を
 * `db: MemoryDbConnection` に置換する追加 codemod。
 *
 * migrate-tests-codemod.mts は `new SQL.Database()` を含むテストのみが対象で、
 * `openMemoryCoreDb()` のみを使うテスト (phase2_7_agent.test.ts 等) はスキップする。
 * このスクリプトはそうしたテストの型注釈を機械的に置換する。
 *
 * 対象外:
 *   - __tests__/db/attach.test.ts (attach.ts は sql.js 専用、Database 型のまま残す)
 *   - __tests__/db/connection/ 配下 (新規 connection テスト、SqlJsMemoryDb 直接利用)
 */
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const TESTS_ROOT = path.join(PROJECT_ROOT, '__tests__');
const TYPES_PATH = path.join(PROJECT_ROOT, 'src', 'db', 'connection', 'types.ts');

const EXCLUDE_PATTERNS = [
  /__tests__\/db\/connection\//,
  /__tests__\/db\/attach\.test\.ts$/,
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
  const rel = path.relative(dir, TYPES_PATH).replace(/\\/g, '/').replace(/\.ts$/, '');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

let touched = 0;

for (const file of walk(TESTS_ROOT)) {
  if (EXCLUDE_PATTERNS.some((re) => re.test(file))) continue;

  const original = fs.readFileSync(file, 'utf8');
  let updated = original;

  // `: Database` 型注釈を `: MemoryDbConnection` に置換
  const before = updated;
  updated = updated.replace(/:\s*Database(?![A-Za-z0-9_$])/g, ': MemoryDbConnection');
  if (updated === before) continue;

  // MemoryDbConnection 型 import を追加 (まだ無い場合)
  if (!/MemoryDbConnection\s*[,}]/.test(updated.split('\n').filter((l) => l.startsWith('import')).join('\n'))) {
    const importPath = relativeImport(file);
    const newImport = `import type { MemoryDbConnection } from '${importPath}';\n`;
    const firstImportMatch = /^(import[^\n]*\n)/m.exec(updated);
    if (firstImportMatch) {
      const insertAt = firstImportMatch.index + firstImportMatch[0].length;
      updated = updated.slice(0, insertAt) + newImport + updated.slice(insertAt);
    } else {
      updated = newImport + updated;
    }
  }

  if (updated !== original) {
    fs.writeFileSync(file, updated);
    touched++;
    console.log(`  modified: ${path.relative(PROJECT_ROOT, file)}`);
  }
}

console.log(`\nTouched ${touched} test files`);
