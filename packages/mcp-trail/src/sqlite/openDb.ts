import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Database } from 'better-sqlite3';
import { loadBetterSqlite3 } from '../internal/loadBetterSqlite3';

export interface OpenedDb {
  readonly db: Database;
  readonly path: string;
  readonly mode: 'readonly' | 'readwrite';
  /**
   * 互換 API。better-sqlite3 はファイル直書きなので no-op。
   * sql.js 時代は in-memory → tmp + rename で atomic 書き出しだった。
   */
  save(): void;
  /** Database を close する */
  close(): void;
}

/**
 * activity.db を better-sqlite3 で開く。
 *
 * - readonly: better-sqlite3 の `readonly: true` で開き、SQLite 層で書き込み拒否
 * - readwrite: 通常 open。変更は WAL を経由してメインファイルへ反映される。
 *
 * sql.js (WASM in-memory) 時代と異なり、better-sqlite3 はファイル直書きなので
 * `save()` は no-op。呼び出し側 (旧 atomic 書き出し前提のコード) を破壊しない
 * ために API は残す。
 */
export async function openTrailDb(
  dbPath: string,
  mode: 'readonly' | 'readwrite',
): Promise<OpenedDb> {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`activity.db not found: ${dbPath}`);
  }
  const Ctor = loadBetterSqlite3();
  const db = new Ctor(dbPath, { readonly: mode === 'readonly' });
  return wrapOpenedDb(db, dbPath, mode);
}

/**
 * caravan-book.db を better-sqlite3 で開く。
 *
 * Flight Record（instructions / instruction_sessions / flight_reviews）の移設
 * （2026-08-07）に伴い、指示台帳の直書きはこちらを使う。
 *
 * ファイル不在は原則 throw（fail-closed。場所違いの空 DB を黙って作ると以降の
 * クエリが一律 0 件の偽陰性になる）。**例外は readwrite かつ同ディレクトリに
 * activity.db が実在する場合**で、このときだけ新規作成を許す — 既存ワークスペース
 * （activity.db 実在が正しい `<trailHome>/db` の証左）で、拡張が caravan-book.db を
 * 作るより先にセッション開始の宣言が届いても記録を落とさないため
 * （「デーモン未起動でも宣言が落ちない」設計要件の維持）。
 *
 * 拡張の memory pipeline / デーモンと同一ファイルを共有するため WAL を保証し、
 * busy_timeout を設定する（書き込みは短時間）。
 */
export async function openMemoryDb(
  dbPath: string,
  mode: 'readonly' | 'readwrite',
): Promise<OpenedDb> {
  if (!fs.existsSync(dbPath)) {
    // 移行前ワークスペース（旧名 trail.db のみ実在）も既存ワークスペースとして扱う。
    const dbDir = path.dirname(dbPath);
    const hasSiblingTrailDb = ['activity.db', 'trail.db'].some((name) =>
      fs.existsSync(path.join(dbDir, name)),
    );
    if (mode !== 'readwrite' || !hasSiblingTrailDb) {
      throw new Error(`caravan-book.db not found: ${dbPath}`);
    }
  }
  const Ctor = loadBetterSqlite3();
  const db = new Ctor(dbPath, { readonly: mode === 'readonly' });
  if (mode === 'readwrite') {
    // WAL は前提でなく実装で担保する（新規作成直後は既定の DELETE ジャーナルのため）。
    const journalMode = String(db.pragma('journal_mode = WAL', { simple: true }));
    if (journalMode.toLowerCase() !== 'wal') {
      console.error(`[mcp-trail] caravan-book.db journal_mode=WAL unavailable (got ${journalMode})`);
    }
  }
  db.pragma('busy_timeout = 5000');
  // activity.db 時代と同じく FK は強制しない（better-sqlite3 は既定 ON。
  // instruction_sessions の FK は宣言のみの運用 — trail-activity tables.ts のコメント参照）
  db.pragma('foreign_keys = OFF');
  return wrapOpenedDb(db, dbPath, mode);
}

function wrapOpenedDb(
  db: Database,
  dbPath: string,
  mode: 'readonly' | 'readwrite',
): OpenedDb {
  const save = (): void => {
    if (mode !== 'readwrite') {
      throw new Error('Cannot save: db opened in readonly mode');
    }
    // better-sqlite3 はメインファイルに直書きするため明示的な flush 不要。
    // WAL モードの場合 PRAGMA wal_checkpoint(TRUNCATE) を呼ぶこともできるが、
    // close() 時に SQLite 側で checkpoint されるので通常は不要。
  };

  const close = (): void => {
    db.close();
  };

  return { db, path: dbPath, mode, save, close };
}
