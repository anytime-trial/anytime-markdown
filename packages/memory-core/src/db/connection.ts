import initSqlJs, { Database } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import { getMemoryCoreDbPath } from './paths';
import { runMigrations } from './migrations/runner';

export interface MemoryCoreDb {
  db: Database;
  save(): void;
  close(): void;
}

export async function openMemoryCoreDb(dbPath?: string): Promise<MemoryCoreDb> {
  const resolvedPath = dbPath ?? getMemoryCoreDbPath();
  const dir = path.dirname(resolvedPath);
  fs.mkdirSync(dir, { recursive: true });

  const SQL = await initSqlJs();
  let db: Database;

  if (fs.existsSync(resolvedPath)) {
    const data = fs.readFileSync(resolvedPath);
    db = new SQL.Database(data);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);

  return {
    db,
    save(): void {
      const data = db.export();
      fs.writeFileSync(resolvedPath, Buffer.from(data));
    },
    close(): void {
      db.close();
    },
  };
}
