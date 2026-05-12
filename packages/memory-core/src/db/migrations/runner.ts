import * as fs from 'fs';
import * as path from 'path';
import type { MemoryDbConnection } from '../connection/types';

const MIGRATIONS: { version: number; file: string }[] = [
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
  { version: 13, file: '013_rag_fts.sql' },
];

export function runMigrations(conn: MemoryDbConnection): void {
  conn.execMany(`CREATE TABLE IF NOT EXISTS _migrations (
    version    INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  ) STRICT`);

  const result = conn.exec('SELECT version FROM _migrations');
  const applied: number[] = (result[0]?.values ?? []).map((r) => Number(r[0]));

  for (const migration of MIGRATIONS) {
    if (!applied.includes(migration.version)) {
      const sqlPath = path.join(__dirname, migration.file);
      const sql = fs.readFileSync(sqlPath, 'utf8');
      conn.execMany(sql);
      conn.run(
        `INSERT INTO _migrations (version, applied_at) VALUES (?, ?)`,
        [migration.version, new Date().toISOString()],
      );
    }
  }
}
