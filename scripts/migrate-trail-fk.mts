#!/usr/bin/env node
/**
 * 既存 SQLite DB を tables.ts の最新スキーマ (STRICT + CHECK + 拡張 FK + ON DELETE)
 * に再構築する。公式 12-step テーブル再作成パターンを使い、データを保持しつつ
 * 制約・FK のみを書き換える。
 *
 * 使い方:
 *   node --experimental-strip-types scripts/migrate-trail-fk.mts <db-path>
 *
 * tables.ts を直接 import するので、DDL の二重管理は発生しない。
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import {
  CREATE_SESSIONS,
  CREATE_SESSION_COSTS,
  CREATE_DAILY_COUNTS,
  CREATE_MESSAGES,
  CREATE_SESSION_COMMITS,
  CREATE_COMMIT_FILES,
  CREATE_SESSION_COMMIT_RESOLUTIONS,
  CREATE_MESSAGE_COMMITS,
  CREATE_CURRENT_GRAPHS,
  CREATE_RELEASE_GRAPHS,
  CREATE_SKILL_MODELS,
  CREATE_RELEASES,
  CREATE_RELEASE_FILES,
  CREATE_RELEASE_COVERAGE,
  CREATE_CURRENT_COVERAGE,
  CREATE_MESSAGE_TOOL_CALLS,
  CREATE_C4_MANUAL_ELEMENTS,
  CREATE_C4_MANUAL_RELATIONSHIPS,
  CREATE_C4_MANUAL_GROUPS,
  CREATE_CURRENT_CODE_GRAPHS,
  CREATE_RELEASE_CODE_GRAPHS,
  CREATE_CURRENT_CODE_GRAPH_COMMUNITIES,
  CREATE_RELEASE_CODE_GRAPH_COMMUNITIES,
  CREATE_CURRENT_FILE_ANALYSIS,
  CREATE_RELEASE_FILE_ANALYSIS,
  CREATE_CURRENT_FUNCTION_ANALYSIS,
  CREATE_RELEASE_FUNCTION_ANALYSIS,
} from '../packages/trail-core/src/domain/schema/tables.ts';
import {
  CREATE_INDEXES,
  CREATE_RELEASE_INDEXES,
  CREATE_CURRENT_COVERAGE_INDEXES,
  CREATE_MESSAGE_TOOL_CALLS_INDEXES,
} from '../packages/trail-core/src/domain/schema/indexes.ts';

// 順序: 親テーブルが先になるように並べる (再作成時の FK 検証ロールバックに有利)
const TABLES: ReadonlyArray<{ name: string; ddl: string }> = [
  { name: 'sessions', ddl: CREATE_SESSIONS },
  { name: 'session_costs', ddl: CREATE_SESSION_COSTS },
  { name: 'daily_counts', ddl: CREATE_DAILY_COUNTS },
  { name: 'messages', ddl: CREATE_MESSAGES },
  { name: 'session_commits', ddl: CREATE_SESSION_COMMITS },
  { name: 'commit_files', ddl: CREATE_COMMIT_FILES },
  { name: 'session_commit_resolutions', ddl: CREATE_SESSION_COMMIT_RESOLUTIONS },
  { name: 'message_commits', ddl: CREATE_MESSAGE_COMMITS },
  { name: 'current_graphs', ddl: CREATE_CURRENT_GRAPHS },
  { name: 'release_graphs', ddl: CREATE_RELEASE_GRAPHS },
  { name: 'skill_models', ddl: CREATE_SKILL_MODELS },
  { name: 'releases', ddl: CREATE_RELEASES },
  { name: 'release_files', ddl: CREATE_RELEASE_FILES },
  { name: 'release_coverage', ddl: CREATE_RELEASE_COVERAGE },
  { name: 'current_coverage', ddl: CREATE_CURRENT_COVERAGE },
  { name: 'message_tool_calls', ddl: CREATE_MESSAGE_TOOL_CALLS },
  { name: 'c4_manual_elements', ddl: CREATE_C4_MANUAL_ELEMENTS },
  { name: 'c4_manual_relationships', ddl: CREATE_C4_MANUAL_RELATIONSHIPS },
  { name: 'c4_manual_groups', ddl: CREATE_C4_MANUAL_GROUPS },
  { name: 'current_code_graphs', ddl: CREATE_CURRENT_CODE_GRAPHS },
  { name: 'release_code_graphs', ddl: CREATE_RELEASE_CODE_GRAPHS },
  { name: 'current_code_graph_communities', ddl: CREATE_CURRENT_CODE_GRAPH_COMMUNITIES },
  { name: 'release_code_graph_communities', ddl: CREATE_RELEASE_CODE_GRAPH_COMMUNITIES },
  { name: 'current_file_analysis', ddl: CREATE_CURRENT_FILE_ANALYSIS },
  { name: 'release_file_analysis', ddl: CREATE_RELEASE_FILE_ANALYSIS },
  { name: 'current_function_analysis', ddl: CREATE_CURRENT_FUNCTION_ANALYSIS },
  { name: 'release_function_analysis', ddl: CREATE_RELEASE_FUNCTION_ANALYSIS },
];

// 旧 idx_mtc_* インデックスを新命名 (idx_message_tool_calls_*) にリネームする辞書
const INDEX_RENAMES: Record<string, string> = {
  idx_mtc_session: 'idx_message_tool_calls_session_id',
  idx_mtc_tool_name: 'idx_message_tool_calls_tool_name',
  idx_mtc_timestamp: 'idx_message_tool_calls_timestamp',
  idx_mtc_skill: 'idx_message_tool_calls_skill_name',
  idx_mtc_is_error: 'idx_message_tool_calls_is_error',
  idx_mtc_turn: 'idx_message_tool_calls_session_turn',
  idx_mtc_ts_turn: 'idx_message_tool_calls_timestamp_turn',
  idx_mtc_unique: 'idx_message_tool_calls_message_uuid_call_index',
};

// SQLite 既定の `YYYY-MM-DD HH:mm:ss` 形式を ISO 8601 + Z に正規化する対象
const TS_NORMALIZE_TARGETS: ReadonlyArray<readonly [table: string, col: string]> = [
  ['sessions', 'commits_resolved_at'],
  ['session_commit_resolutions', 'resolved_at'],
  ['current_graphs', 'updated_at'],
  ['release_graphs', 'updated_at'],
  ['current_code_graphs', 'updated_at'],
  ['current_code_graph_communities', 'generated_at'],
  ['current_code_graph_communities', 'updated_at'],
];

const dbPath = process.argv[2];
if (!dbPath) {
  console.error('Usage: node --experimental-strip-types scripts/migrate-trail-fk.mts <db-path>');
  process.exit(1);
}
const abs = path.resolve(dbPath);
if (!fs.existsSync(abs)) {
  console.error('DB not found:', abs);
  process.exit(1);
}
const bak = abs + '.bak-' + Date.now();
fs.copyFileSync(abs, bak);
console.log('backup ->', bak);

const db = new Database(abs);

function tableExists(name: string): boolean {
  return (
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name) != null
  );
}
function pragmaTableInfo(name: string): Array<{ name: string; type: string; notnull: number; pk: number }> {
  return db.pragma(`table_info("${name}")`) as Array<{ name: string; type: string; notnull: number; pk: number }>;
}
function getRelatedObjects(table: string): Array<{ type: string; name: string; sql: string }> {
  return db
    .prepare(
      `SELECT type, name, sql FROM sqlite_master
       WHERE tbl_name = ? AND type IN ('index','trigger','view')
         AND sql IS NOT NULL`,
    )
    .all(table) as Array<{ type: string; name: string; sql: string }>;
}

// `CREATE TABLE IF NOT EXISTS X (` → `CREATE TABLE X__new (` に書き換える
function toNewDdl(ddl: string, tableName: string): string {
  const re = new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName}\\b`);
  return ddl.replace(re, `CREATE TABLE ${tableName}__new`);
}

console.log('PRAGMA foreign_keys = OFF (during migration)');
db.pragma('foreign_keys = OFF');

// ──── pre-migration: SQLite 既定形式 timestamp を ISO 8601 + Z に正規化 ────
console.log('normalizing SQLite-style timestamps to ISO 8601 + Z');
for (const [t, c] of TS_NORMALIZE_TARGETS) {
  if (!tableExists(t)) continue;
  const cols = pragmaTableInfo(t).map((x) => x.name);
  if (!cols.includes(c)) continue;
  const r = db
    .prepare(
      `UPDATE "${t}" SET "${c}" = REPLACE("${c}", ' ', 'T') || '.000Z'
       WHERE "${c}" IS NOT NULL AND length("${c}") = 19`,
    )
    .run();
  if (r.changes > 0) console.log(`  ${t}.${c}: normalized ${r.changes} rows`);
}

// ──── view / trigger を全件退避 (テーブル再作成中の view 検証エラーを防ぐ) ────
const viewDefs = db
  .prepare("SELECT name, sql FROM sqlite_master WHERE type='view' AND sql IS NOT NULL")
  .all() as Array<{ name: string; sql: string }>;
const triggerDefs = db
  .prepare("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND sql IS NOT NULL")
  .all() as Array<{ name: string; sql: string }>;
console.log(`stashing ${viewDefs.length} views, ${triggerDefs.length} triggers`);
for (const t of triggerDefs) db.exec(`DROP TRIGGER IF EXISTS "${t.name}"`);
for (const v of viewDefs) db.exec(`DROP VIEW IF EXISTS "${v.name}"`);

// ──── 旧 idx_mtc_* インデックスを drop (新名で再作成は最後に行う) ────
for (const oldName of Object.keys(INDEX_RENAMES)) {
  db.exec(`DROP INDEX IF EXISTS "${oldName}"`);
}

// ──── テーブル再作成 ────
const tx = db.transaction(() => {
  for (const def of TABLES) {
    if (!tableExists(def.name)) {
      console.log('- skip (not present):', def.name);
      continue;
    }
    const newDdl = toNewDdl(def.ddl, def.name);
    db.exec(`DROP TABLE IF EXISTS "${def.name}__new"`);
    db.exec(newDdl);
    const newColInfo = pragmaTableInfo(`${def.name}__new`);
    const newCols = newColInfo.map((c) => c.name);
    const existingCols = pragmaTableInfo(def.name).map((c) => c.name);
    const sharedCols = newCols.filter((c) => existingCols.includes(c));
    if (sharedCols.length === 0) {
      console.log('- skip (no shared columns):', def.name);
      db.exec(`DROP TABLE "${def.name}__new"`);
      continue;
    }
    const related = getRelatedObjects(def.name);
    console.log(`migrating ${def.name} (${sharedCols.length} cols, ${related.length} related objects)`);

    // STRICT テーブルでは型不一致 (TEXT→REAL 等) が拒否されるため、宣言型に CAST
    const typeByCol = new Map(newColInfo.map((c) => [c.name, (c.type || '').toUpperCase()]));
    const selectExprs = sharedCols.map((c) => {
      const t = typeByCol.get(c) || '';
      if (t === 'INT' || t === 'INTEGER' || t === 'REAL') {
        return `CAST("${c}" AS ${t}) AS "${c}"`;
      }
      return `"${c}"`;
    });
    db.exec(
      `INSERT INTO "${def.name}__new" (${sharedCols.map((c) => `"${c}"`).join(',')})
       SELECT ${selectExprs.join(',')} FROM "${def.name}"`,
    );
    db.exec(`DROP TABLE "${def.name}"`);
    db.exec(`ALTER TABLE "${def.name}__new" RENAME TO "${def.name}"`);

    // インデックスは再作成 (view / trigger は最後にまとめて行う)
    for (const obj of related) {
      if (obj.type === 'view' || obj.type === 'trigger') continue;
      try {
        const renamedTo = INDEX_RENAMES[obj.name];
        if (renamedTo) {
          // 旧名 → 新名にリネームして再作成
          const newSql = obj.sql.replace(
            new RegExp(`(\\bINDEX\\s+)(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:"${obj.name}"|${obj.name})\\b`, 'i'),
            `$1IF NOT EXISTS "${renamedTo}"`,
          );
          db.exec(`DROP INDEX IF EXISTS "${renamedTo}"`);
          db.exec(newSql);
        } else {
          db.exec(`DROP INDEX IF EXISTS "${obj.name}"`);
          db.exec(obj.sql);
        }
      } catch (e) {
        console.warn(`  failed to recreate ${obj.type} ${obj.name}: ${(e as Error).message}`);
      }
    }
  }
});
tx();

// ──── インデックスを最新命名で再作成 (idx_mtc_* → idx_message_tool_calls_*) ────
const allIndexSqls = [
  ...CREATE_INDEXES,
  ...CREATE_RELEASE_INDEXES,
  ...CREATE_CURRENT_COVERAGE_INDEXES,
  ...CREATE_MESSAGE_TOOL_CALLS_INDEXES,
];
for (const sql of allIndexSqls) {
  try {
    db.exec(sql);
  } catch (e) {
    console.warn(`failed to recreate index: ${(e as Error).message}`);
  }
}

// ──── view / trigger を再作成 ────
for (const v of viewDefs) {
  try {
    db.exec(v.sql);
  } catch (e) {
    console.warn(`failed to recreate view ${v.name}: ${(e as Error).message}`);
  }
}
for (const t of triggerDefs) {
  try {
    db.exec(t.sql);
  } catch (e) {
    console.warn(`failed to recreate trigger ${t.name}: ${(e as Error).message}`);
  }
}

// ──── FK 違反 (orphan) cleanup ────
console.log('PRAGMA foreign_key_check (before cleanup)');
const violationsBefore = db.pragma('foreign_key_check') as Array<{
  table: string;
  rowid: number | null;
  parent: string;
  fkid: number;
}>;
if (violationsBefore.length === 0) {
  console.log('no FK violations');
} else {
  console.warn(`FK violations detected: ${violationsBefore.length} rows (orphans). running cleanup...`);
  const fkInfoCache = new Map<string, Array<{ id: number; from: string; on_delete: string }>>();
  function getFkInfo(table: string) {
    if (!fkInfoCache.has(table)) {
      fkInfoCache.set(
        table,
        db.pragma(`foreign_key_list("${table}")`) as Array<{
          id: number;
          from: string;
          on_delete: string;
        }>,
      );
    }
    return fkInfoCache.get(table)!;
  }

  const groups = new Map<string, { table: string; fkid: number; rowids: number[] }>();
  for (const v of violationsBefore) {
    const key = `${v.table}::${v.fkid}`;
    if (!groups.has(key)) groups.set(key, { table: v.table, fkid: v.fkid, rowids: [] });
    if (v.rowid != null) groups.get(key)!.rowids.push(v.rowid);
  }

  const cleanupTx = db.transaction(() => {
    for (const g of groups.values()) {
      const fkList = getFkInfo(g.table);
      const matched = fkList.filter((f) => f.id === g.fkid);
      if (matched.length === 0) {
        console.warn(`  fk meta missing for ${g.table} fkid=${g.fkid}, skip`);
        continue;
      }
      const onDelete = (matched[0].on_delete || 'NO ACTION').toUpperCase();
      const fromCols = matched.map((m) => m.from);
      if (g.rowids.length === 0) continue;

      const chunkSize = 500;
      let processed = 0;
      for (let i = 0; i < g.rowids.length; i += chunkSize) {
        const chunk = g.rowids.slice(i, i + chunkSize);
        const placeholders = chunk.map(() => '?').join(',');
        if (onDelete === 'SET NULL') {
          const setClause = fromCols.map((c) => `"${c}" = NULL`).join(',');
          db.prepare(`UPDATE "${g.table}" SET ${setClause} WHERE rowid IN (${placeholders})`).run(...chunk);
        } else {
          db.prepare(`DELETE FROM "${g.table}" WHERE rowid IN (${placeholders})`).run(...chunk);
        }
        processed += chunk.length;
      }
      console.log(`  ${g.table} fkid=${g.fkid} (${onDelete}): processed ${processed} rows`);
    }
  });
  cleanupTx();

  console.log('PRAGMA foreign_key_check (after cleanup)');
  const violationsAfter = db.pragma('foreign_key_check') as Array<unknown>;
  if (violationsAfter.length === 0) console.log('no FK violations after cleanup');
  else console.warn(`!! still ${violationsAfter.length} violations remain after cleanup`);
}

db.pragma('foreign_keys = ON');
db.close();
console.log('done. backup at:', bak);
