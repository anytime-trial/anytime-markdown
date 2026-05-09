import { Database } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS: { version: number; file: string }[] = [
  { version: 1, file: '001_initial.sql' },
  { version: 2, file: '002_phase2.sql' },
  { version: 3, file: '003_phase2_5.sql' },
  { version: 4, file: '004_pipeline_scope.sql' },
];

export function runMigrations(db: Database): void {
  db.run(`CREATE TABLE IF NOT EXISTS _migrations (
    version    INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  ) STRICT`);

  const result = db.exec('SELECT version FROM _migrations');
  const applied: number[] = (result[0]?.values ?? []).map((r) => r[0] as number);

  for (const migration of MIGRATIONS) {
    if (!applied.includes(migration.version)) {
      const sqlPath = path.join(__dirname, migration.file);
      const sql = fs.readFileSync(sqlPath, 'utf8');
      db.run(sql);
      db.run(
        `INSERT INTO _migrations (version, applied_at) VALUES (?, ?)`,
        [migration.version, new Date().toISOString()]
      );
    }
  }
}
