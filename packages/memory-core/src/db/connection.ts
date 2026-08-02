import * as fs from 'node:fs';
import * as path from 'node:path';
import { runMigrations } from './migrations/runner';
import { BetterSqlite3MemoryDb } from './connection/BetterSqlite3MemoryDb';
import type { MemoryDbConnection } from './connection/types';

export interface MemoryCoreDb {
  /**
   * 新規コードはこちらを使う。`db` と同じ参照だが、命名で「新 IF」を明示する。
   * テスト等で独自に MemoryCoreDb を生成する場合は省略可 (`db` を fallback とする)。
   */
  conn?: MemoryDbConnection;
  /**
   * 旧 sql.js driver 時代のエイリアス。新規コードは `conn` を使うこと。
   */
  db: MemoryDbConnection;
  /** better-sqlite3 はライブ commit のため no-op。旧呼出し互換のため残す。 */
  save(): void;
  close(): void;
}

export interface OpenMemoryCoreDbOptions {
  /**
   * better-sqlite3 の native binary (.node) への絶対パス。
   * VS Code 拡張のように bundled された環境で指定する
   * (database-core/BetterSqlite3Adapter と同じパターン)。
   */
  readonly nativeBinding?: string;
}

/**
 * memory-core.db を開く（不在なら作成しマイグレーションを流す）。
 *
 * `dbPath` は**必須**。省略時に `getMemoryCoreDbPath()`（= `process.cwd()` 基準）へ
 * フォールバックしていたが、本関数は解決先に `mkdirSync` + マイグレーションを行うため、
 * cwd がずれた場所から呼ぶとスキーマ完備の空 DB が生まれ、以降のクエリが一律 0 件を返す。
 * 呼び出し側からは「該当なし」と区別が付かない偽陰性になるため、解決は呼び出し側の責務と
 * する（`~/.claude/rules/code-quality.md` §15）。
 */
export async function openMemoryCoreDb(
  dbPath: string,
  opts?: OpenMemoryCoreDbOptions,
): Promise<MemoryCoreDb> {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  const conn: MemoryDbConnection = new BetterSqlite3MemoryDb({
    filePath: dbPath,
    readOnly: false,
    nativeBinding: opts?.nativeBinding,
  });

  conn.run('PRAGMA foreign_keys = ON');
  // 並行アクセス対応: 拡張ホスト内で複数モジュール (memoryCoreRunner /
  // ChatBridge / RebuildScheduler / MemoryApiHandler) が同じ memory-core.db を
  // 開く可能性があるため WAL モードに切り替える。あわせて busy_timeout=5000 で
  // ロック競合を 5 秒間リトライさせる。
  try {
    conn.run('PRAGMA journal_mode = WAL');
  } catch (_error) {
    // 一部 SQLite ビルドで WAL 不可な場合に備え silent fallback (DELETE モードのまま)
  }
  conn.run('PRAGMA busy_timeout = 5000');
  runMigrations(conn);

  return {
    conn,
    db: conn,
    save(): void {
      // better-sqlite3 はライブで書き込み済み (no-op)
    },
    close(): void {
      conn.close();
    },
  };
}
