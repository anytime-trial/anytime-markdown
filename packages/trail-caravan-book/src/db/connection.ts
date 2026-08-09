import * as fs from 'node:fs';
import * as path from 'node:path';
import { runMigrations } from './migrations/runner';
import { resolveDbWithLegacyRename } from './legacyDbRename';
import { BetterSqlite3CaravanDb } from './connection/BetterSqlite3CaravanDb';
import type { CaravanDbConnection } from './connection/types';

export interface CaravanBookDb {
  /**
   * 新規コードはこちらを使う。`db` と同じ参照だが、命名で「新 IF」を明示する。
   * テスト等で独自に CaravanBookDb を生成する場合は省略可 (`db` を fallback とする)。
   */
  conn?: CaravanDbConnection;
  /**
   * 旧 sql.js driver 時代のエイリアス。新規コードは `conn` を使うこと。
   */
  db: CaravanDbConnection;
  /** better-sqlite3 はライブ commit のため no-op。旧呼出し互換のため残す。 */
  save(): void;
  close(): void;
}

export interface OpenCaravanBookDbOptions {
  /**
   * better-sqlite3 の native binary (.node) への絶対パス。
   * VS Code 拡張のように bundled された環境で指定する
   * (database-core/BetterSqlite3Adapter と同じパターン)。
   */
  readonly nativeBinding?: string;
}

/**
 * caravan-book.db を開く（不在なら作成しマイグレーションを流す）。
 *
 * `dbPath` は**必須**。省略時に `getCaravanBookDbPath()`（= `process.cwd()` 基準）へ
 * フォールバックしていたが、本関数は解決先に `mkdirSync` + マイグレーションを行うため、
 * cwd がずれた場所から呼ぶとスキーマ完備の空 DB が生まれ、以降のクエリが一律 0 件を返す。
 * 呼び出し側からは「該当なし」と区別が付かない偽陰性になるため、解決は呼び出し側の責務と
 * する（`~/.claude/rules/code-quality.md` §15）。
 */
export async function openCaravanBookDb(
  dbPath: string,
  opts?: OpenCaravanBookDbOptions,
): Promise<CaravanBookDb> {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  // DB ファイル名変更（memory-core.db→caravan-book.db・2026-08-08）のレガシー移行。owner は
  // デーモン/拡張の open 経路のみ（mcp-trail 等のサイドカーは物理リネームしない）。
  // 任意パス（テスト・明示指定）を巻き込まないよう、新既定名を開くときだけ実施する。
  const filePath =
    path.basename(dbPath) === 'caravan-book.db'
      ? resolveDbWithLegacyRename({
          dir,
          current: 'caravan-book.db',
          legacy: 'memory-core.db',
          warn: (m) => console.error(`[trail-caravan-book] ${m}`),
        }).path
      : dbPath;

  const conn: CaravanDbConnection = new BetterSqlite3CaravanDb({
    filePath,
    readOnly: false,
    nativeBinding: opts?.nativeBinding,
  });

  conn.run('PRAGMA foreign_keys = ON');
  // 並行アクセス対応: 拡張ホスト内で複数モジュール (caravanBookRunner /
  // ChatBridge / RebuildScheduler / CaravanApiHandler) が同じ caravan-book.db を
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
