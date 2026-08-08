/**
 * 検証実施台帳（activity.db の activity_verification_runs）の共有アクセス層（writer 正本）。
 *
 * 保存先は activity.db — Flight Record の指示（caravan_instructions / caravan_instruction_sessions。
 * 2026-08-07 に caravan-book.db へ移設済み）と session_id で結合できる位置に
 * 置くことで、session_id 経由で「どの指示で何を検証したか」を結合できる。
 * スキーマの正本は packages/trail-activity/src/domain/schema/tables.ts の CREATE_VERIFICATION_RUNS で、
 * 本ファイルはその **ミラー**（.mjs から TS を import できないため）。片方だけ変えないこと。
 * 読み取り側（packages/mcp-trail/src/tools/verificationStatus.ts）は SELECT のみで作成しない。
 * 提案: /Shared/anytime-markdown-docs/proposal/20260706-verification-run-db.ja.md
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const VERIFICATION_KINDS = Object.freeze([
  'unit',
  'build',
  'next-build',
  'typecheck',
  'lint',
  'e2e',
  'manual',
]);

export const RUN_STATUSES = Object.freeze(['pass', 'fail', 'error']);

// 永続データ保護: dev スクリプトはユーザー永続領域へ書かない（~/.claude / vscode-server 等）。
const PROTECTED_ROOT_PATTERNS = [/\/vscode-server\//, /\/\.vscode\b/, /\/\.claude\b/];

/**
 * 検証を実行した場所から「台帳のあるワークスペース根」を解く。
 *
 * 基点は `git rev-parse --git-common-dir` の親であって `--show-toplevel` ではない。worktree
 * では toplevel が worktree 自身を指すため、そこを根にすると **worktree ごとに空の activity.db が
 * 新規作成され**、指示（instructions / caravan_instruction_sessions）のある本体の台帳には 1 行も
 * 入らない。検証を回したセッションは本体の指示に属するので、書き先も本体へ寄せる。
 * git 管理下でなければ与えられた根（既定 cwd）へ縮退する。
 */
function resolveWorkspaceRootForLedger(startDir) {
  const cwd = startDir ?? process.cwd();
  try {
    const commonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8' }).trim();
    if (commonDir === '') return cwd;
    return path.dirname(path.resolve(cwd, commonDir));
  } catch (err) {
    console.warn(
      `[verification-db] git root の解決に失敗したため cwd を使う (cwd=${cwd}): ${err instanceof Error ? err.message : String(err)}`,
    );
    return cwd;
  }
}

/**
 * TRAIL_HOME 規約（env → <workspaceRoot>/.anytime/trail）で activity.db のパスを解決する。
 *
 * DB ファイル名変更（trail.db→activity.db・2026-08-08）移行前のワークスペース（旧名のみ実在）
 * では旧名へフォールバックする。本スクリプトはサイドカーであり物理リネームは owner
 * （拡張・デーモン）に任せる — ここで新名の空 DB を作ると owner の移行が「新名実在」で
 * skip され、既存台帳が旧名側に座礁する。
 */
export function resolveTrailDbPath(workspaceRoot) {
  const home = process.env.TRAIL_HOME ?? path.join(resolveWorkspaceRootForLedger(workspaceRoot), '.anytime', 'trail');
  if (PROTECTED_ROOT_PATTERNS.some((p) => p.test(home))) {
    throw new Error(
      `[verification-db] refusing protected path "${home}". Set TRAIL_HOME to a workspace-local dir or pass workspaceRoot.`,
    );
  }
  const currentPath = path.join(home, 'db', 'activity.db');
  if (fs.existsSync(currentPath)) return currentPath;
  const legacyPath = path.join(home, 'db', 'trail.db');
  if (fs.existsSync(legacyPath)) return legacyPath;
  return currentPath;
}

// tables.ts の TS_GLOB_MS / TS_GLOB_NO_MS と同値。CHECK まで含めて一致していないと、
// CREATE TABLE IF NOT EXISTS の「先に作った側が勝つ」性質により、writer が先に走ったときだけ
// 緩い制約でテーブルが固定される。値の一致は verification-db.test.mjs が正本と突合して守る。
const TS_GLOB_MS = `'[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'`;
const TS_GLOB_NO_MS = `'[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'`;

// packages/trail-activity/src/domain/schema/tables.ts の CREATE_VERIFICATION_RUNS のミラー。
// activity.db 側の _migrations（key TEXT PRIMARY KEY）は使わない — verification.db 時代の
// (version INTEGER, applied_at TEXT) とは形が非互換で、触ると拡張のマイグレーション記録を壊す。
// 追記のみ・冪等な DDL なのでバージョン管理表を持たずに済む。
// SHORTCUT: 保持期間 prune 未実装. ceiling: 1 検証=1 行の追記のみで増加は緩やか. upgrade: フェーズ2 の dev-retro 連携導入時に保持方針を決めて prune を実装.
export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS activity_verification_runs (
  id INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL DEFAULT '',
  workspace_path TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('unit','build','next-build','typecheck','lint','e2e','manual')),
  package TEXT NOT NULL,
  command TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pass','fail','error')),
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  commit_hash TEXT NOT NULL,
  tree_state TEXT NOT NULL CHECK (tree_state IN ('clean','dirty')),
  code_state_hash TEXT,
  environment TEXT CHECK (environment IS NULL OR json_valid(environment)),
  started_at TEXT NOT NULL CHECK (started_at GLOB ${TS_GLOB_MS} OR started_at GLOB ${TS_GLOB_NO_MS}),
  finished_at TEXT NOT NULL CHECK (finished_at GLOB ${TS_GLOB_MS} OR finished_at GLOB ${TS_GLOB_NO_MS})
) STRICT`,
  `CREATE INDEX IF NOT EXISTS idx_verification_runs_session ON activity_verification_runs(session_id, started_at)`,
  `CREATE INDEX IF NOT EXISTS idx_verification_runs_pkg_state ON activity_verification_runs(package, code_state_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_verification_runs_started ON activity_verification_runs(started_at)`,
];

/**
 * activity.db を開いて activity_verification_runs を用意したコネクションを返す。`:memory:` はテスト用。
 *
 * journal_mode は設定しない: activity.db は拡張が WAL で開いている共有 DB で、モード変更は
 * 他プロセスの接続を巻き込む。foreign_keys は node:sqlite の既定が ON だが、activity.db は
 * OFF 前提（宣言のみの FK がある）なので明示的に落とす。
 */
export function openVerificationLedger(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath, { enableForeignKeyConstraints: false });
  db.exec('PRAGMA busy_timeout = 5000');
  for (const sql of SCHEMA_STATEMENTS) db.exec(sql);
  return db;
}

/**
 * 検証実行 1 回を記録する（INSERT・副作用あり）。
 * code_state_hash は clean 時のみ commitHash（dirty はスキップ判定に使わないため NULL）。
 */
export function recordRun(db, run) {
  if (!VERIFICATION_KINDS.includes(run.kind)) {
    throw new Error(`[verification-db] unknown kind "${run.kind}" (expected: ${VERIFICATION_KINDS.join('/')})`);
  }
  if (!RUN_STATUSES.includes(run.status)) {
    throw new Error(`[verification-db] unknown status "${run.status}" (expected: ${RUN_STATUSES.join('/')})`);
  }
  const codeStateHash = run.treeState === 'clean' ? run.commitHash : null;
  db.prepare(
    `INSERT INTO activity_verification_runs
     (session_id, workspace_path, kind, package, command, status, duration_ms, commit_hash, tree_state, code_state_hash, environment, started_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    // 空文字＝帰属不明（CLAUDE_CODE_SESSION_ID の無い手動実行）。NULL にしないのは STRICT +
    // NOT NULL の列で、指示への結合を IN 句 1 本で書けるようにするため。
    run.sessionId ?? '',
    run.workspacePath ?? '',
    run.kind,
    run.package,
    run.command,
    run.status,
    // STRICT なので INTEGER でない値は INSERT ごと落ちる（Date 差分は常に整数だが防御的に丸める）
    Math.round(run.durationMs),
    run.commitHash,
    run.treeState,
    codeStateHash,
    run.environment ?? null,
    run.startedAt,
    run.finishedAt,
  );
}

/** 指定 package × コード状態で pass 済みの kind ごとの最新 run を返す（Map<kind, row>）。 */
export function queryVerifiedKinds(db, { packageName, codeStateHash }) {
  const rows = db
    .prepare(
      `SELECT kind, command, started_at FROM activity_verification_runs
       WHERE package = ? AND code_state_hash = ? AND status = 'pass' ORDER BY started_at`,
    )
    .all(packageName, codeStateHash);
  const latest = new Map();
  for (const row of rows) latest.set(row.kind, row); // 昇順走査なので最後の代入が最新
  return latest;
}

/** テスト結果書用: コミット・期間で run を横断取得する（started_at 昇順）。 */
export function listRuns(db, { commitHash, sinceIso, untilIso } = {}) {
  const cond = [];
  const args = [];
  if (commitHash) {
    cond.push('commit_hash = ?');
    args.push(commitHash);
  }
  if (sinceIso) {
    cond.push('started_at >= ?');
    args.push(sinceIso);
  }
  if (untilIso) {
    cond.push('started_at <= ?');
    args.push(untilIso);
  }
  const where = cond.length > 0 ? `WHERE ${cond.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM activity_verification_runs ${where} ORDER BY started_at`).all(...args);
}
