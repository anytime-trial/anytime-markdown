import * as fs from 'fs';
import * as path from 'path';
import type { MemoryDbConnection } from '../connection/types';

interface MigrationDef {
  readonly version: number;
  readonly file: string;
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
];

let cachedFts5: WeakMap<MemoryDbConnection, boolean> | null = null;

export function hasFts5(conn: MemoryDbConnection): boolean {
  if (!cachedFts5) cachedFts5 = new WeakMap();
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

export function runMigrations(conn: MemoryDbConnection): void {
  conn.execMany(`CREATE TABLE IF NOT EXISTS _migrations (
    version    INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  ) STRICT`);

  const result = conn.exec('SELECT version FROM _migrations');
  const applied: number[] = (result[0]?.values ?? []).map((r) => Number(r[0]));

  for (const migration of MIGRATIONS) {
    if (applied.includes(migration.version)) continue;
    if (migration.requiresFts5 && !hasFts5(conn)) {
      const ts = new Date().toISOString();
      // eslint-disable-next-line no-console
      console.log(
        `[${ts}] [WARN] memory-core: migration ${migration.file} skipped (SQLite build lacks FTS5)`,
      );
      continue;
    }
    const sqlPath = path.join(__dirname, migration.file);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    conn.execMany(sql);
    conn.run(
      `INSERT INTO _migrations (version, applied_at) VALUES (?, ?)`,
      [migration.version, new Date().toISOString()],
    );
  }
}
