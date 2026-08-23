#!/usr/bin/env node
/**
 * 既存の Codex セッション行 (`activity_sessions.source = 'codex'`) の `repo_name` を、
 * 取込側と同じ規則で振り直す。
 *
 * 通常はこのスクリプトを使う必要はない。同じ是正は `TrailDatabase` の in-app migration
 * `backfillCodexRepoNameFromCwd_v3` が DB オープン時に `_migrations` 冪等で実行する。
 * 本スクリプトは、コピー DB に対して事前に結果を確認したい場合と、拡張を起動せずに
 * 適用したい場合のための手動経路で、**同じ `_migrations` キーを共有する**ので、
 * どちらか一方が走れば他方は no-op になる。
 *
 * 使い方:
 *   npx tsx scripts/migrate-codex-repo-name.mts <db-path> [--dry-run]
 *
 * (--experimental-strip-types は不可。sessionMeta.ts が辿る trail-activity の
 *  ディレクトリ import を Node の strip-only ローダが解決できないため。)
 *
 * 分類規則は `sessionMeta.ts` を直接 import するので、取込側との二重管理は発生しない。
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

import { readCodexSessionCwd, resolveCodexRepoName } from '../packages/trail-db/src/sessionMeta.ts';

/** in-app migration と共有する冪等キー。どちらか一方が走れば他方は no-op になる。 */
const MIGRATION_KEY = 'codex_repo_name_from_cwd_v3';

interface Args {
  dbPath: string;
  dryRun: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const positional: string[] = [];
  let dryRun = false;
  for (const a of argv) {
    if (a === '--dry-run') dryRun = true;
    // 未知のオプションを positional へ落とすと、`--dryrun` のようなタイポが黙って
    // 書き込みモードになる。拒否して気づけるようにする。
    else if (a.startsWith('-')) throw new Error(`不明なオプション: ${a}`);
    else positional.push(a);
  }
  if (positional.length !== 1) {
    throw new Error(`db-path をちょうど 1 つ指定してください (受け取った数: ${positional.length})`);
  }
  return { dbPath: path.resolve(positional[0]), dryRun };
}

interface PlannedUpdate {
  id: string;
  next: string;
  current: string | null;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(args.dbPath)) throw new Error(`DB が見つかりません: ${args.dbPath}`);

  if (!args.dryRun) {
    // `~/.claude/rules/code-quality.md` §15: 保護領域への書き込みは書き込み前バックアップを伴う。
    // 先行例 scripts/migrate-trail-fk.mts と同じく、コードで強制する（コメントの運用手順は
    // 強制力を持たない）。
    const backup = `${args.dbPath}.bak-${Date.now()}`;
    fs.copyFileSync(args.dbPath, backup);
    console.log(`backup -> ${backup}`);
  }

  // dry-run は書き込まないので読み取り専用で開く (稼働中の本番 DB へ WAL を触らせない)。
  // fileMustExist で、パスを打ち間違えたときに空 DB を作らせない。
  const db = new Database(args.dbPath, { readonly: args.dryRun, fileMustExist: true });
  try {
    db.pragma('busy_timeout = 60000');

    // 新しい DB では _migrations がまだ無い。readonly では作れないので存在を先に見る。
    const hasMigrationsTable = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_migrations'")
      .pluck()
      .get();
    const alreadyDone =
      hasMigrationsTable &&
      db.prepare('SELECT 1 FROM _migrations WHERE key = ?').pluck().get(MIGRATION_KEY);
    if (alreadyDone) {
      console.log(`[migrate-codex-repo-name] ${MIGRATION_KEY} は適用済みです。何もしません。`);
      return;
    }

    const rows = db
      .prepare(
        `SELECT s.id, s.file_path, r.repo_name AS current_repo_name
           FROM activity_sessions s
           LEFT JOIN activity_repos r ON r.repo_id = s.repo_id
          WHERE s.source = 'codex' AND s.file_path != ''`,
      )
      .all() as { id: string; file_path: string; current_repo_name: string | null }[];

    // --- 1) DB に触らずに全行の分類を確定させる ------------------------------------
    // Why: ファイル I/O をトランザクションの内側で回すと、書き込みトランザクションを
    // 全 rollout の読み取りのあいだ開きっぱなしにする。deferred BEGIN では読み取り
    // スナップショット確定後に他接続が commit すると SQLITE_BUSY_SNAPSHOT になり、
    // これは busy_timeout でリトライされない。
    const plan: PlannedUpdate[] = [];
    let unchanged = 0;
    let missing = 0;
    let unreadable = 0;
    let cwdMissing = 0;
    const transitions = new Map<string, number>();

    for (const row of rows) {
      const cwdResult = readCodexSessionCwd(row.file_path);
      if (cwdResult.kind === 'unreadable') {
        // 読めなかった行は触らない。根拠が無いまま既存の分類を codex-unknown へ壊さない。
        // rollout のローテートで消えているのは常態なので静かに数え、それ以外は警告する。
        if ((cwdResult.error as NodeJS.ErrnoException).code === 'ENOENT') {
          missing += 1;
        } else {
          console.warn(`  読み取り失敗のためスキップ: ${row.file_path} (${cwdResult.error.message})`);
          unreadable += 1;
        }
        continue;
      }
      // cwd が実在しないと git ルートまで遡れず、cwd 自身の basename へ落ちる。分類の
      // 何割が「実行時にパスが実在するか」という不安定な根拠に立っているかの目安になる
      // (他ワークスペースの cwd はこの環境に存在しないのが常態)。
      if (cwdResult.kind === 'resolved' && !fs.existsSync(cwdResult.cwd)) cwdMissing += 1;
      const next = resolveCodexRepoName(cwdResult);
      if (next === row.current_repo_name) {
        unchanged += 1;
        continue;
      }
      const key = `${row.current_repo_name ?? '(null)'} -> ${next}`;
      transitions.set(key, (transitions.get(key) ?? 0) + 1);
      plan.push({ id: row.id, next, current: row.current_repo_name });
    }

    // --- 2) 書き込みだけを BEGIN IMMEDIATE で短時間に閉じる --------------------------
    if (!args.dryRun) {
      const selectRepo = db.prepare('SELECT repo_id FROM activity_repos WHERE repo_name = ?');
      const insertRepo = db.prepare(
        'INSERT INTO activity_repos (repo_name, created_at) VALUES (?, ?)',
      );
      const updateSession = db.prepare('UPDATE activity_sessions SET repo_id = ? WHERE id = ?');
      db.exec('CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY)');
      const markDone = db.prepare('INSERT OR IGNORE INTO _migrations (key) VALUES (?)');
      const now = new Date().toISOString();
      const repoIdCache = new Map<string, number>();
      const repoIdFor = (name: string): number => {
        const cached = repoIdCache.get(name);
        if (cached !== undefined) return cached;
        const found = selectRepo.get(name) as { repo_id: number } | undefined;
        const id = found ? found.repo_id : Number(insertRepo.run(name, now).lastInsertRowid);
        repoIdCache.set(name, id);
        return id;
      };

      const apply = db.transaction(() => {
        for (const p of plan) updateSession.run(repoIdFor(p.next), p.id);
        markDone.run(MIGRATION_KEY);
      });
      // immediate にすると書き込みロックを開始時点で取得するので、待ちが busy_timeout の
      // 対象になる (deferred のまま昇格させると BUSY_SNAPSHOT でリトライ不能になる)。
      apply.immediate();
    }

    console.log(`[migrate-codex-repo-name] db=${args.dbPath} dryRun=${args.dryRun}`);
    console.log(`  codex rows: ${rows.length}`);
    console.log(
      `  changed=${plan.length} unchanged=${unchanged} missing=${missing} unreadable=${unreadable} cwdMissing=${cwdMissing}`,
    );
    for (const [k, v] of [...transitions].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${k}: ${v}`);
    }
  } finally {
    // 例外時も接続を閉じる。閉じないと WAL を掴んだまま落ちる。
    db.close();
  }
}

main();
