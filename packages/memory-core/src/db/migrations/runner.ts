import { Database } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';

export function runMigrations(db: Database): void {
  db.run(`CREATE TABLE IF NOT EXISTS _migrations (
    version    INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  ) STRICT`);

  const result = db.exec('SELECT version FROM _migrations');
  const applied: number[] = (result[0]?.values ?? []).map((r) => r[0] as number);

  // Migration 1: 001_initial.sql
  if (!applied.includes(1)) {
    const sqlPath = path.join(__dirname, '001_initial.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    db.run(sql);
    db.run(
      `INSERT INTO _migrations (version, applied_at) VALUES (1, ?)`,
      [new Date().toISOString()]
    );
  }
}
