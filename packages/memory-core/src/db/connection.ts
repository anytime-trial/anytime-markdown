import * as fs from 'fs';
import * as path from 'path';
import { getMemoryCoreDbPath } from './paths';
import { runMigrations } from './migrations/runner';
import { BetterSqlite3MemoryDb } from './connection/BetterSqlite3MemoryDb';
import { SqlJsMemoryDb } from './connection/SqlJsMemoryDb';
import type { MemoryDbConnection } from './connection/types';

export type MemoryCoreDbDriver = 'better-sqlite3' | 'sql.js';

export interface MemoryCoreDb {
  /**
   * 新規コードはこちらを使う。`db` と同じ参照だが、命名で「新 IF」を明示する。
   * テスト等で独自に MemoryCoreDb を生成する場合は省略可 (`db` を fallback とする)。
   */
  conn?: MemoryDbConnection;
  /**
   * sql.js 互換のエイリアス (移行中の既存呼出し用)。
   * 戻り値は MemoryDbConnection 互換のため、`db.exec(...)` / `db.run(...)` 等は
   * そのまま動く。新規コードは `conn` を使うこと。
   */
  db: MemoryDbConnection;
  save(): void;
  close(): void;
}

export interface OpenMemoryCoreDbOptions {
  /** "better-sqlite3" (default) | "sql.js" */
  readonly driver?: MemoryCoreDbDriver;
  /**
   * better-sqlite3 の native binary (.node) への絶対パス。
   * VS Code 拡張のように bundled された環境で指定する
   * (database-core/BetterSqlite3Adapter と同じパターン)。
   */
  readonly nativeBinding?: string;
}

function resolveDriver(opts?: OpenMemoryCoreDbOptions): MemoryCoreDbDriver {
  if (opts?.driver) return opts.driver;
  const env = process.env.MEMORY_CORE_DRIVER;
  if (env === 'sql.js' || env === 'better-sqlite3') return env;
  return 'better-sqlite3';
}

export async function openMemoryCoreDb(
  dbPath?: string,
  opts?: OpenMemoryCoreDbOptions,
): Promise<MemoryCoreDb> {
  const resolvedPath = dbPath ?? getMemoryCoreDbPath();
  const dir = path.dirname(resolvedPath);
  fs.mkdirSync(dir, { recursive: true });

  const driver = resolveDriver(opts);

  let conn: MemoryDbConnection;
  if (driver === 'sql.js') {
    const bytes = fs.existsSync(resolvedPath)
      ? new Uint8Array(fs.readFileSync(resolvedPath))
      : undefined;
    conn = bytes
      ? await SqlJsMemoryDb.openFromBytes(bytes)
      : await SqlJsMemoryDb.openInMemory();
  } else {
    conn = new BetterSqlite3MemoryDb({
      filePath: resolvedPath,
      readOnly: false,
      nativeBinding: opts?.nativeBinding,
    });
  }

  conn.run('PRAGMA foreign_keys = ON');
  // 並行アクセス対応: 拡張ホスト内で複数モジュール (memoryCoreRunner /
  // ChatBridge / RebuildScheduler / MemoryApiHandler) が同じ memory-core.db を
  // 開く可能性があるため WAL モードに切り替える (sql.js は WAL 未対応なので
  // better-sqlite3 driver の時だけ)。あわせて busy_timeout=5000 を設定し、
  // ロック競合は即時 fail ではなく 5 秒間リトライさせる。
  if (driver === 'better-sqlite3') {
    try {
      conn.run('PRAGMA journal_mode = WAL');
    } catch (_error) {
      // 一部 SQLite ビルドで WAL 不可な場合に備え silent fallback (DELETE モードのまま)
    }
    conn.run('PRAGMA busy_timeout = 5000');
  }
  runMigrations(conn);

  return {
    conn,
    db: conn,
    save(): void {
      if (driver === 'sql.js' && conn instanceof SqlJsMemoryDb) {
        const bytes = conn.exportBytes();
        fs.writeFileSync(resolvedPath, Buffer.from(bytes));
      }
      // better-sqlite3 はライブで書き込み済み (no-op)
    },
    close(): void {
      conn.close();
    },
  };
}
