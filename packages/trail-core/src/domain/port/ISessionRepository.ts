// domain/port/ISessionRepository.ts — Session data access port

import type { TrailMessageCommit, MessageCommitMatchConfidence } from '../model/session';

export interface SessionStats {
  readonly sessionCount: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalCacheReadTokens: number;
  readonly totalDurationMs: number;
}

export interface MessageCommitInput {
  readonly messageUuid: string;
  readonly sessionId: string;
  readonly commitHash: string;
  readonly detectedAt: string;
  readonly matchConfidence: MessageCommitMatchConfidence;
}

export interface ISessionRepository {
  getStatsByBranch(branchName: string): SessionStats | null;
  insertMessageCommit(input: MessageCommitInput): void;
  getMessageCommitsBySession(sessionId: string): readonly TrailMessageCommit[];
  markMessageCommitsResolved(sessionId: string, resolvedAt: string): void;
  isMessageCommitsResolved(sessionId: string): boolean;
}
