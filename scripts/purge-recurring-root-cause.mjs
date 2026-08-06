#!/usr/bin/env node
/**
 * recurring_root_cause の drift イベントと、その入力だった会話由来 `caused_by` エッジを
 * memory-core.db から削除する 1 回限りのメンテナンススクリプト。
 *
 * 背景: 会話本文から LLM に根本原因を特定させる経路は接地しなかった（File 型の根本原因
 * 1,493 件のうちリポジトリに実在したのは 40 件 = 2.7%）。検出処理は本ブランチで削除済み。
 *
 * 既定は dry-run。`--confirm` を付けたときだけ書き込む。書き込み前に必ずバックアップを取る。
 *
 * 使い方:
 *   node scripts/purge-recurring-root-cause.mjs [--db <path>]            # dry-run
 *   node scripts/purge-recurring-root-cause.mjs [--db <path>] --confirm  # 実行
 *
 * 注意: Trail 拡張が旧コードのまま動いている間は、次のパイプライン実行で同じデータが
 * 再生成される。拡張が本ブランチのコードを積んでから実行すること（冪等なので再実行可）。
 */
import Database from 'better-sqlite3';
import { existsSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_DB = '.anytime/trail/db/memory-core.db';
const DRIFT_TYPE = 'recurring_root_cause';
const PREDICATE = 'caused_by';

function parseArgs(argv) {
  const args = { db: DEFAULT_DB, confirm: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--db') {
      const value = argv[++i];
      if (!value) throw new Error('--db にパスが指定されていません');
      args.db = value;
    } else if (argv[i] === '--confirm') {
      args.confirm = true;
    } else {
      throw new Error(`未知の引数: ${argv[i]}`);
    }
  }
  return args;
}

function countRows(db, sql, params = []) {
  return db.prepare(sql).pluck().get(...params) ?? 0;
}

function hasTable(db, name) {
  return (
    db
      .prepare(`SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND name = ?`)
      .pluck()
      .get(name) === 1
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = resolve(args.db);
  if (!existsSync(dbPath)) {
    console.error(`[purge] DB が見つかりません: ${dbPath}`);
    process.exit(1);
  }

  const db = new Database(dbPath);
  db.pragma('busy_timeout = 30000');

  const before = {
    driftEvents: countRows(db, `SELECT COUNT(*) FROM memory_drift_events WHERE drift_type = ?`, [DRIFT_TYPE]),
    edges: countRows(db, `SELECT COUNT(*) FROM memory_edges WHERE predicate = ?`, [PREDICATE]),
  };

  console.log(`[purge] db=${dbPath}`);
  console.log(`[purge] 削除対象: drift_events(${DRIFT_TYPE})=${before.driftEvents} / edges(${PREDICATE})=${before.edges}`);

  if (!args.confirm) {
    console.log('[purge] dry-run です。実行するには --confirm を付けてください。');
    db.close();
    return;
  }

  // バックアップ。SQLite の backup API を使い、WAL の内容を含む一貫したコピーを取る。
  const backupPath = `${dbPath}.bak.pre-purge-root-cause`;
  if (existsSync(backupPath)) {
    console.error(`[purge] バックアップが既に存在します: ${backupPath}（上書きしません。退避してから再実行してください）`);
    db.close();
    process.exit(1);
  }
  // VACUUM INTO のファイル名は式なのでバインドできる。文字列連結すると SQLite が
  // 二重引用符を識別子と解釈して "no such column" になる。
  db.prepare('VACUUM INTO ?').run(backupPath);
  console.log(`[purge] バックアップ作成: ${backupPath}`);

  const deleted = db.transaction(() => {
    // FTS ミラーは外部コンテンツではなく rowid 手動同期なので、本体より先に消す。
    let fts = 0;
    if (hasTable(db, 'memory_drift_events_fts')) {
      fts = db
        .prepare(
          `DELETE FROM memory_drift_events_fts
            WHERE rowid IN (SELECT rowid FROM memory_drift_events WHERE drift_type = ?)`,
        )
        .run(DRIFT_TYPE).changes;
    }
    const driftEvents = db.prepare(`DELETE FROM memory_drift_events WHERE drift_type = ?`).run(DRIFT_TYPE).changes;
    const edges = db.prepare(`DELETE FROM memory_edges WHERE predicate = ?`).run(PREDICATE).changes;
    return { fts, driftEvents, edges };
  })();

  const after = {
    driftEvents: countRows(db, `SELECT COUNT(*) FROM memory_drift_events WHERE drift_type = ?`, [DRIFT_TYPE]),
    edges: countRows(db, `SELECT COUNT(*) FROM memory_edges WHERE predicate = ?`, [PREDICATE]),
  };

  console.log(`[purge] 削除: drift_events=${deleted.driftEvents} / fts=${deleted.fts} / edges=${deleted.edges}`);
  console.log(`[purge] 残存: drift_events=${after.driftEvents} / edges=${after.edges}`);

  db.close();

  // 「0 件になった」を実測で確かめてから成功と言う。残っていれば非 0 で落とす。
  if (after.driftEvents !== 0 || after.edges !== 0) {
    console.error('[purge] 削除しきれていません。バックアップから復旧を検討してください。');
    process.exit(1);
  }
  console.log('[purge] 完了。');
}

main();
