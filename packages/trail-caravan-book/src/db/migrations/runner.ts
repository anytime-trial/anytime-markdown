import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CaravanDbConnection } from '../connection/types';
import { applyTablePrefix, applyTablePrefixFts } from './023_table_prefix';
import { applyFtsIdentifierTokens } from './030_fts_identifier_tokens';

interface MigrationDef {
  readonly version: number;
  /** SQL ファイル移行。apply とどちらか一方を必ず持つ。 */
  readonly file?: string;
  /** code 移行（存在ガード等、SQL だけで書けない冪等化が要る場合）。 */
  readonly apply?: (conn: CaravanDbConnection) => void;
  /** true なら FTS5 が無い SQLite ビルド (sql.js 既定 WASM 等) では skip する。 */
  readonly requiresFts5?: boolean;
}

const MIGRATIONS: MigrationDef[] = [
  { version: 1, file: '001_initial.sql' },
  { version: 2, file: '002_phase2.sql' },
  { version: 3, file: '003_phase2_5.sql' },
  { version: 4, file: '004_pipeline_scope.sql' },
  { version: 5, file: '005_phase2_7_doc_session.sql' },
  { version: 6, file: '006_review_pipeline_scope.sql' },
  { version: 7, file: '007_phase2_7_agent.sql' },
  { version: 8, file: '008_phase3.sql' },
  { version: 9, file: '009_phase4.sql' },
  { version: 10, file: '010_pipeline_heartbeat.sql' },
  { version: 11, file: '011_failed_items_retry_scope.sql' },
  { version: 12, file: '012_function_entity_lifecycle.sql' },
  { version: 13, file: '013_rag_fts.sql', requiresFts5: true },
  { version: 14, file: '014_spec_doc_reference_type.sql' },
  { version: 15, file: '015_checklist_ref.sql' },
  { version: 16, file: '016_review_workspace.sql' },
  { version: 17, file: '017_pipeline_run_ledger.sql' },
  { version: 18, file: '018_pipeline_run_logs.sql' },
  { version: 19, file: '019_pipeline_run_logs_source.sql' },
  { version: 20, file: '020_workspace_scope.sql' },
  { version: 21, file: '021_review_body_backfill_scope.sql' },
  { version: 22, file: '022_review_finding_extracted_by.sql' },
  { version: 23, apply: applyTablePrefix },
  { version: 24, apply: applyTablePrefixFts, requiresFts5: true },
  { version: 25, file: '025_defines_predicate.sql' },
  { version: 26, file: '026_entity_layout.sql' },
  { version: 27, file: '027_entity_layout_degree.sql' },
  { version: 28, file: '028_community_summaries.sql' },
  { version: 29, file: '029_code_edge_predicates.sql' },
  { version: 30, apply: applyFtsIdentifierTokens, requiresFts5: true },
  { version: 31, file: '031_search_events.sql' },
  { version: 32, file: '032_search_event_source.sql' },
]

/**
 * 適用済みになるはずの migration 件数 `[FTS5 非対応環境, FTS5 対応環境]`。
 * FTS5 非対応環境では `requiresFts5` の migration が適用されないため 2 値を持つ。
 * テスト側が件数をハードコードすると migration 追加のたびに期待値が陳腐化するため公開する。
 */
export const EXPECTED_MIGRATION_COUNTS: readonly [number, number] = [
  MIGRATIONS.filter((migration) => !migration.requiresFts5).length,
  MIGRATIONS.length,
];

let cachedFts5: WeakMap<CaravanDbConnection, boolean> | null = null;

export function hasFts5(conn: CaravanDbConnection): boolean {
  cachedFts5 ??= new WeakMap();
  const cached = cachedFts5.get(conn);
  if (cached !== undefined) return cached;
  let supported = false;
  try {
    conn.execMany(
      `CREATE VIRTUAL TABLE temp.__fts5_probe USING fts5(content); DROP TABLE temp.__fts5_probe`,
    );
    supported = true;
  } catch (_error) {
    supported = false;
  }
  cachedFts5.set(conn, supported);
  return supported;
}

export function runMigrations(conn: CaravanDbConnection): void {
  conn.execMany(`CREATE TABLE IF NOT EXISTS _migrations (
    version    INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  ) STRICT`);

  const result = conn.exec('SELECT version FROM _migrations');
  const applied = new Set<number>((result[0]?.values ?? []).map((r) => Number(r[0])));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    if (migration.requiresFts5 && !hasFts5(conn)) {
      const ts = new Date().toISOString();
      // eslint-disable-next-line no-console
      console.log(
        `[${ts}] [WARN] trail-caravan-book: migration ${migration.file ?? `v${migration.version}`} skipped (SQLite build lacks FTS5)`,
      );
      continue;
    }
    if (migration.apply) {
      migration.apply(conn);
    } else if (migration.file) {
      const sqlPath = path.join(__dirname, migration.file);
      const sql = fs.readFileSync(sqlPath, 'utf8');
      conn.execMany(sql);
    } else {
      throw new Error(
        `trail-caravan-book: migration v${migration.version} has neither file nor apply`,
      );
    }
    conn.run(
      `INSERT INTO _migrations (version, applied_at) VALUES (?, ?)`,
      [migration.version, new Date().toISOString()],
    );
  }
}
