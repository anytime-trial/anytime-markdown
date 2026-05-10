#!/usr/bin/env node
/**
 * 既存 trail.db に `category` 列を追加する。
 * - current_file_analysis.category
 * - release_file_analysis.category
 *
 * 既存行は DEFAULT 'logic' で埋まる。次回 analyze 実行時に
 * classifyFile() の判定結果で上書きされる想定。
 *
 * SQLite は ALTER TABLE ADD COLUMN で CHECK + NOT NULL DEFAULT を
 * サポートするため、12-step テーブル再作成は不要。
 *
 * 使い方:
 *   node --experimental-strip-types packages/trail-core/scripts/migrate-add-category.mts <db-path>
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const ADD_CATEGORY_SQL = `
  ALTER TABLE %TABLE% ADD COLUMN category TEXT NOT NULL
    DEFAULT 'logic'
    CHECK (category IN ('ui', 'logic', 'excluded'))
`;

const TARGET_TABLES = ['current_file_analysis', 'release_file_analysis'] as const;

function pad(s: string, n: number) {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function logInfo(msg: string): void {
  const stamp = new Date().toISOString();
  console.log(`[${stamp}] [INFO] ${msg}`);
}

function logError(msg: string, err?: unknown): void {
  const stamp = new Date().toISOString();
  console.error(`[${stamp}] [ERROR] ${msg}`);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  } else if (err !== undefined) {
    console.error(err);
  }
}

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const rows = db.pragma(`table_info("${table}")`) as ReadonlyArray<{ name: string }>;
  return rows.some((r) => r.name === column);
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table);
  return Boolean(row);
}

function backupDb(dbPath: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const bak = `${dbPath}.before-add-category-${date}.bak`;
  fs.copyFileSync(dbPath, bak);
  return bak;
}

function main(): void {
  const dbPath = process.argv[2];
  if (!dbPath) {
    logError('Usage: migrate-add-category.mts <db-path>');
    process.exit(1);
  }
  if (!fs.existsSync(dbPath)) {
    logError(`DB not found: ${dbPath}`);
    process.exit(1);
  }

  logInfo(`target db: ${path.resolve(dbPath)}`);
  const bak = backupDb(dbPath);
  logInfo(`backup created: ${bak}`);

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  try {
    db.exec('BEGIN');

    for (const table of TARGET_TABLES) {
      if (!tableExists(db, table)) {
        logInfo(`${pad(table, 30)} -> table does not exist (skipped)`);
        continue;
      }
      if (columnExists(db, table, 'category')) {
        logInfo(`${pad(table, 30)} -> category column already exists (skipped)`);
        continue;
      }
      const sql = ADD_CATEGORY_SQL.replaceAll('%TABLE%', table);
      db.exec(sql);
      logInfo(`${pad(table, 30)} -> category column added`);
    }

    // FK 整合性 + 制約整合性チェック
    const fkViolations = db.pragma('foreign_key_check') as readonly unknown[];
    if (fkViolations.length > 0) {
      throw new Error(`foreign_key_check returned ${fkViolations.length} violations`);
    }
    const intCheck = db.pragma('integrity_check') as ReadonlyArray<{ integrity_check: string }>;
    if (intCheck.length !== 1 || intCheck[0].integrity_check !== 'ok') {
      throw new Error(`integrity_check failed: ${JSON.stringify(intCheck)}`);
    }

    db.exec('COMMIT');
    logInfo('migration committed.');

    // 検証用の SELECT
    for (const table of TARGET_TABLES) {
      if (!tableExists(db, table)) continue;
      const rows = db
        .prepare(`SELECT category, COUNT(*) AS cnt FROM ${table} GROUP BY category`)
        .all() as ReadonlyArray<{ category: string; cnt: number }>;
      logInfo(`${pad(table, 30)} -> ${JSON.stringify(rows)}`);
    }
  } catch (err) {
    db.exec('ROLLBACK');
    logError('migration failed, rolled back.', err);
    db.close();
    process.exit(1);
  }

  db.close();
  logInfo('done.');
}

main();
