// status/agentStatusSchema.ts — agent_sessions の DDL と timestamp GLOB 定数
//
// trail-core の tables.ts と同等の設計原則（STRICT・CHECK・GLOB timestamp・json_valid）に従うが、
// trail 非依存を保つため定数・DDL を本パッケージ側で独立に定義する（trail-core を import しない）。
//
// summary は handoff payload（圧縮ステート JSON）を保持する。json_valid CHECK を付すため、旧スキーマ
// （CHECK 無し・DEFAULT ''）からは 12-step テーブル再作成で移行する（AgentStatusStore.migrate）。
// handoff_at は引き継ぎ確定時刻（summary_at は将来のナラティブ要約生成時刻に予約）。

// ISO 8601 UTC timestamp パターン。ms 付き (24 chars) と ms なし (20 chars) の両方を許容する。
export const TS_GLOB_MS = `'[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'`;
export const TS_GLOB_NO_MS = `'[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'`;

/** agent_sessions の DDL を生成する。移行時は別名（agent_sessions_new）でも使えるよう table 名を引数化。 */
export function agentSessionsDDL(table = 'agent_sessions'): string {
  return `CREATE TABLE IF NOT EXISTS ${table} (
  session_id       TEXT PRIMARY KEY,
  editing          INTEGER NOT NULL DEFAULT 0 CHECK (editing IN (0, 1)),
  file             TEXT NOT NULL DEFAULT '',
  branch           TEXT NOT NULL DEFAULT '',
  workspace_path   TEXT NOT NULL DEFAULT '',
  session_edits    TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(session_edits)),
  planned_edits    TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(planned_edits)),
  last_head        TEXT,
  committed_count  INTEGER NOT NULL DEFAULT 0 CHECK (committed_count >= 0),
  last_commit_hash TEXT,
  last_commit_at   TEXT CHECK (last_commit_at IS NULL OR last_commit_at GLOB ${TS_GLOB_MS} OR last_commit_at GLOB ${TS_GLOB_NO_MS}),
  summary          TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(summary)),
  summary_at       TEXT CHECK (summary_at IS NULL OR summary_at GLOB ${TS_GLOB_MS} OR summary_at GLOB ${TS_GLOB_NO_MS}),
  handoff_at       TEXT CHECK (handoff_at IS NULL OR handoff_at GLOB ${TS_GLOB_MS} OR handoff_at GLOB ${TS_GLOB_NO_MS}),
  updated_at       TEXT NOT NULL CHECK (updated_at GLOB ${TS_GLOB_MS} OR updated_at GLOB ${TS_GLOB_NO_MS})
) STRICT`;
}

export const CREATE_AGENT_SESSIONS = agentSessionsDDL();

/**
 * git_activity の DDL。
 *
 * git の reference-transaction / post-checkout フックが記録する ref 操作の履歴。
 * agent_sessions と同じ DB に置くのは、実行者の帰属（session_id）を単一の結合で解けるようにするため。
 *
 * session_id は **FK を張らない**非正規化列である。git 操作には「対応する agent_sessions 行が
 * 存在しない」正常系が 2 つあるため:
 *   1. ワーカー停止中（VS Code を閉じている間）はフックが spool にだけ書き、agent_sessions は
 *      更新されない。取り込み時に親行は無い。
 *   2. agent_sessions は sessionRetentionDays（既定 7 日）で prune されるが、git_activity は
 *      フォレンジクス用途でより長く保持する（既定 90 日）。
 * FK を張ると、これらの正常系で「どのセッションがやったか」という最も価値のある情報を失う
 * （SET NULL）か、幽霊セッション行を捏造することになる。どちらも許容できない。
 * 肥大は pruneGitActivityOlderThan が抑える。
 *
 * AUTOINCREMENT は使わない（INTEGER PRIMARY KEY は ROWID と同義）。
 */
export function gitActivityDDL(table = 'git_activity'): string {
  return `CREATE TABLE IF NOT EXISTS ${table} (
  id             INTEGER PRIMARY KEY,
  workspace_path TEXT NOT NULL,
  op_type        TEXT NOT NULL CHECK (op_type IN (
                   'commit','merge','rebase','reset','checkout','branch-create',
                   'branch-delete','push','fetch','cherry-pick','revert','other')),
  destructive    INTEGER NOT NULL DEFAULT 0 CHECK (destructive IN (0, 1)),
  ref_name       TEXT NOT NULL,
  before_sha     TEXT,
  after_sha      TEXT,
  attribution    TEXT NOT NULL CHECK (attribution IN ('claude', 'agent', 'human')),
  agent_kind     TEXT,
  session_id     TEXT,
  occurred_at    TEXT NOT NULL CHECK (occurred_at GLOB ${TS_GLOB_MS} OR occurred_at GLOB ${TS_GLOB_NO_MS})
) STRICT`;
}

export const CREATE_GIT_ACTIVITY = gitActivityDDL();

export const CREATE_GIT_ACTIVITY_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_git_activity_occurred ON git_activity(occurred_at)',
  'CREATE INDEX IF NOT EXISTS idx_git_activity_session ON git_activity(session_id, occurred_at)',
];
