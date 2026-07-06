/**
 * verification.db — 検証実施台帳の共有アクセス層（writer 正本）。
 * スキーマの所有者は本ファイル。読み取り側（packages/mcp-trail/src/tools/verificationStatus.ts）は
 * SELECT のみでスキーマを作成しない。読取クエリを変える場合は両者を同時に更新すること。
 * 提案: /Shared/anytime-markdown-docs/proposal/20260706-verification-run-db.ja.md
 */
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

/** TRAIL_HOME 規約（env → <workspaceRoot>/.anytime/trail）で verification.db のパスを解決する。 */
export function resolveVerificationDbPath(workspaceRoot) {
  const home = process.env.TRAIL_HOME ?? path.join(workspaceRoot ?? process.cwd(), '.anytime', 'trail');
  if (PROTECTED_ROOT_PATTERNS.some((p) => p.test(home))) {
    throw new Error(
      `[verification-db] refusing protected path "${home}". Set TRAIL_HOME to a workspace-local dir or pass workspaceRoot.`,
    );
  }
  return path.join(home, 'db', 'verification.db');
}

// SHORTCUT: 保持期間 prune 未実装. ceiling: 1 検証=1 行の追記のみで増加は緩やか. upgrade: フェーズ2 の dev-health 連携導入時に保持方針を決めて prune を実装.
const MIGRATIONS = [
  {
    version: 1,
    sql: `
CREATE TABLE verification_runs (
  id INTEGER PRIMARY KEY,
  session_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('unit','build','next-build','typecheck','lint','e2e','manual')),
  package TEXT NOT NULL,
  command TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pass','fail','error')),
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  commit_hash TEXT NOT NULL,
  tree_state TEXT NOT NULL CHECK (tree_state IN ('clean','dirty')),
  code_state_hash TEXT,
  environment TEXT CHECK (environment IS NULL OR json_valid(environment)),
  started_at TEXT NOT NULL CHECK (started_at GLOB '*-*-*T*:*:*Z'),
  finished_at TEXT NOT NULL CHECK (finished_at GLOB '*-*-*T*:*:*Z')
) STRICT;
CREATE INDEX idx_verification_runs_pkg_hash ON verification_runs (package, code_state_hash);
CREATE INDEX idx_verification_runs_session ON verification_runs (session_id);
CREATE INDEX idx_verification_runs_started ON verification_runs (started_at);
`,
  },
];

/** verification.db を開いてマイグレーション適用済みのコネクションを返す。`:memory:` はテスト用。 */
export function openVerificationDb(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  runMigrations(db);
  return db;
}

function runMigrations(db) {
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL) STRICT');
  const applied = new Set(db.prepare('SELECT version FROM _migrations').all().map((r) => r.version));
  const insert = db.prepare('INSERT INTO _migrations (version, applied_at) VALUES (?, ?)');
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    db.exec(m.sql);
    insert.run(m.version, new Date().toISOString());
  }
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
    `INSERT INTO verification_runs
     (session_id, kind, package, command, status, duration_ms, commit_hash, tree_state, code_state_hash, environment, started_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    run.sessionId ?? null,
    run.kind,
    run.package,
    run.command,
    run.status,
    run.durationMs,
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
      `SELECT kind, command, started_at FROM verification_runs
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
  return db.prepare(`SELECT * FROM verification_runs ${where} ORDER BY started_at`).all(...args);
}
