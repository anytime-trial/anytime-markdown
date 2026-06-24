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
