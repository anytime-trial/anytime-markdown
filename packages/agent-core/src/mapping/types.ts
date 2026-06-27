export type MappingState = 'active' | 'recent' | 'stale';

/**
 * セッションの出自。`'claude'` は agent-status worker DB（フック経由）由来、
 * `'codex'` は Codex rollout `.jsonl` の読み取り専用スキャン由来。
 * 変換漏れを Claude 扱いで隠さないよう必須とする（optional 既定 `'claude'` は不可）。
 */
export type AgentSource = 'claude' | 'codex';

export interface SessionLastCommit {
  readonly hash: string;
  /** UTC ISO 8601 */
  readonly timestamp: string;
}

export interface SessionMapping {
  readonly sessionId: string;
  readonly source: AgentSource;
  readonly state: MappingState;
  readonly editing: boolean;
  readonly file: string;
  readonly fileBasename: string;
  readonly timestamp: string;
  readonly ageSeconds: number;
  readonly sessionEdits: readonly { file: string; timestamp: string }[];
  readonly plannedEdits: readonly string[];
  readonly sessionTitle?: string;
  readonly workspacePath?: string;
  readonly contextTokens?: number;
  /** そのセッションのコミット累計（agent-status DB 由来） */
  readonly committedCount?: number;
  /** 最新コミットのハッシュ・時刻（agent-status DB 由来） */
  readonly lastCommit?: SessionLastCommit;
}

export interface WorktreeMapping {
  readonly worktreePath: string;
  readonly worktreeName: string;
  readonly isMain: boolean;
  readonly branch: string;
  readonly sessions: readonly SessionMapping[];
  readonly aggregatedState: MappingState;
  readonly activeCount: number;
}

export interface WorktreeEntry {
  readonly path: string;
  readonly branch: string;
  readonly isMain: boolean;
}
