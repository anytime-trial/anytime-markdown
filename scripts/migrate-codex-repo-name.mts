#!/usr/bin/env node
/**
 * 既存の Codex セッション行 (`activity_sessions.source = 'codex'`) の `repo_name` を、
 * 取込側と同じ規則で振り直す。
 *
 * 背景: 従来の取込は cwd が gitRoot 配下でない rollout を捨てており、取り込まれた行には
 * すべて主リポジトリ名が付いていた。ワークスペース絞り込みの撤廃に伴い、Codex の repo 帰属を
 * Claude Code セッションと同じ `deriveRepoNameFromCwd`（git ルートまで遡り worktree を親へ畳む）
 * で決めるようにしたため、既存行にも同じ規則を適用して分類を揃える。
 *
 * 使い方:
 *   npx tsx scripts/migrate-codex-repo-name.mts <db-path> [--dry-run]
 *
 * (--experimental-strip-types は不可。sessionMeta.ts が辿る trail-activity の
 *  ディレクトリ import を Node の strip-only ローダが解決できないため。)
 *
 * 分類規則は `sessionMeta.ts` を直接 import するので、取込側との二重管理は発生しない。
 *
 * 注意: 本番 `activity.db` へ直接当てない。`cp` でコピー → 本スクリプト → 検証 → 原子的 swap
 * の順で適用する (project スキル `sqlite-table-definition-trail-activity`)。
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';

import {
  readCodexSessionCwd,
  resolveCodexRepoName,
} from '../packages/trail-db/src/sessionMeta.ts';

interface Args {
  dbPath: string;
  dryRun: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const positional: string[] = [];
  let dryRun = false;
  for (const a of argv) {
    if (a === '--dry-run') dryRun = true;
    else positional.push(a);
  }
  const dbPath = positional[0];
  if (!dbPath) throw new Error('db-path を指定してください');
  return { dbPath, dryRun };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  // dry-run は書き込まないので読み取り専用で開く (稼働中の本番 DB へ WAL を触らせない)。
  const db = new Database(args.dbPath, { readonly: args.dryRun });
  // 稼働中のパイプラインと競合しても部分完了で終わらないよう、待ち時間を長めに取る。
  db.pragma('busy_timeout = 60000');

  const rows = db
    .prepare(
      `SELECT s.id, s.file_path, r.repo_name AS current_repo_name
         FROM activity_sessions s
         LEFT JOIN activity_repos r ON r.repo_id = s.repo_id
        WHERE s.source = 'codex'`,
    )
    .all() as { id: string; file_path: string; current_repo_name: string | null }[];

  const selectRepo = db.prepare('SELECT repo_id FROM activity_repos WHERE repo_name = ?');
  const insertRepo = db.prepare('INSERT INTO activity_repos (repo_name, created_at) VALUES (?, ?)');
  const updateSession = db.prepare('UPDATE activity_sessions SET repo_id = ? WHERE id = ?');
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

  let changed = 0;
  let unchanged = 0;
  let unreadable = 0;
  const transitions = new Map<string, number>();

  const apply = db.transaction(() => {
    for (const row of rows) {
      const cwd = readCodexSessionCwd(row.file_path);
      if (cwd === null && !fs.existsSync(row.file_path)) {
        // rollout が既にローテートされ実体が無い行は、根拠が無いので触らない。
        unreadable += 1;
        continue;
      }
      const next = resolveCodexRepoName(cwd);
      if (next === row.current_repo_name) {
        unchanged += 1;
        continue;
      }
      const key = `${row.current_repo_name ?? '(null)'} -> ${next}`;
      transitions.set(key, (transitions.get(key) ?? 0) + 1);
      changed += 1;
      if (!args.dryRun) updateSession.run(repoIdFor(next), row.id);
    }
  });
  apply();

  console.log(`[migrate-codex-repo-name] db=${args.dbPath} dryRun=${args.dryRun}`);
  console.log(`  codex rows: ${rows.length}`);
  console.log(`  changed=${changed} unchanged=${unchanged} unreadable(file missing)=${unreadable}`);
  for (const [k, v] of [...transitions].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k}: ${v}`);
  }
  db.close();
}

main();
