export type MappingState = 'active' | 'recent' | 'stale';

export interface SessionMapping {
  readonly sessionId: string;
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
