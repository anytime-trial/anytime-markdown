#!/usr/bin/env -S node --experimental-strip-types
/**
 * memory-core 内の sql.js Database 型直接依存を MemoryDbConnection に置換する codemod。
 *
 * 変換:
 *   import { Database } from 'sql.js'
 *   import type { Database } from 'sql.js'
 *     → import type { MemoryDbConnection } from '<relative>/db/connection/types'
 *   関数引数の型注釈 `: Database` → `: MemoryDbConnection`
 *
 * 対象外 (sql.js 固有処理):
 *   - src/db/connection/ 配下
 *   - src/db/attach.ts (WASM VFS 経由 ATTACH + write guard、sql.js 専用)
 *   - src/db/sqlJsLoader.ts
 *   - src/db/connection.ts (Phase 2.1 で対応済み)
 *   - src/db/migrations/runner.ts (Phase 2.2 で対応済み)
 *
 * テストファイルは対象外 (Phase 3.5 で個別対応)。
 */

import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const SRC_ROOT = path.join(PROJECT_ROOT, 'src');
const TYPES_PATH = path.join(SRC_ROOT, 'db', 'connection', 'types.ts');

const EXCLUDE_PATTERNS = [
  /\/db\/connection\//,
  /\/db\/attach\.ts$/,
  /\/db\/sqlJsLoader\.ts$/,
  /\/db\/connection\.ts$/,
  /\/db\/migrations\/runner\.ts$/,
];

function* walk(dir: string): IterableIterator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (entry.isFile() && p.endsWith('.ts')) yield p;
  }
}

function relativeImport(fromFile: string): string {
  const dir = path.dirname(fromFile);
  const rel = path.relative(dir, TYPES_PATH).replace(/\\/g, '/').replace(/\.ts$/, '');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

let touched = 0;
const sqlJsImportRegex =
  /^import(?:\s+type)?\s*\{\s*Database\s*\}\s*from\s*'sql\.js';?\s*$/m;
const sqlJsImportMultiRegex =
  /^import(?:\s+type)?\s*\{\s*([^}]+)\s*\}\s*from\s*'sql\.js';?\s*$/m;

for (const file of walk(SRC_ROOT)) {
  if (EXCLUDE_PATTERNS.some((re) => re.test(file))) continue;

  const original = fs.readFileSync(file, 'utf8');
  if (!/from\s+'sql\.js'/.test(original)) continue;

  let updated = original;
  const importPath = relativeImport(file);
  const newImport = `import type { MemoryDbConnection } from '${importPath}';`;

  // パターン 1: import { Database } from 'sql.js' (named のみ)
  if (sqlJsImportRegex.test(updated)) {
    updated = updated.replace(sqlJsImportRegex, newImport);
  } else {
    // パターン 2: import { Database, X, Y } from 'sql.js' — Database のみ除去、他は残す
    const m = sqlJsImportMultiRegex.exec(updated);
    if (m) {
      const named = m[1]
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const otherNamed = named.filter((s) => s !== 'Database' && s !== 'type Database');
      if (otherNamed.length === 0) {
        updated = updated.replace(sqlJsImportMultiRegex, newImport);
      } else {
        const isType = /^import\s+type\b/.test(m[0]);
        const keepImport = `${isType ? 'import type' : 'import'} { ${otherNamed.join(', ')} } from 'sql.js';`;
        updated = updated.replace(sqlJsImportMultiRegex, `${newImport}\n${keepImport}`);
      }
    } else {
      // パターン 3: import type Database from 'sql.js' (default import) — ありえないがスキップ
      continue;
    }
  }

  // 型注釈 ` Database` を ` MemoryDbConnection` に置換
  // (大文字始まりの単独識別子のみ。\b を使う)
  updated = updated.replace(/(?<![A-Za-z0-9_$])Database(?![A-Za-z0-9_$])/g, 'MemoryDbConnection');

  if (updated !== original) {
    fs.writeFileSync(file, updated);
    touched++;
    console.log(`  modified: ${path.relative(PROJECT_ROOT, file)}`);
  }
}

console.log(`\nTouched ${touched} files`);
