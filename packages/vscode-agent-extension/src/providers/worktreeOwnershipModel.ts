import type { AirspaceClaim } from '@anytime-markdown/agent-core';

export interface WorktreeInfo {
  readonly path: string;
  readonly head: string | null;
  readonly branch: string | null;
  readonly detached: boolean;
  readonly bare: boolean;
}

export type OwnershipRow =
  | {
      readonly worktreePath: string;
      readonly branch: string | null;
      readonly sessionId: string;
      readonly pid: number;
      readonly editingFile: string | null;
      readonly lastActivityAt: string;
      readonly state: 'occupied';
      readonly orphan: false;
    }
  | {
      readonly worktreePath: string;
      readonly branch: string | null;
      readonly sessionId: null;
      readonly pid: null;
      readonly editingFile: null;
      readonly lastActivityAt: null;
      readonly state: 'free';
      readonly orphan: false;
    }
  | {
      readonly worktreePath: string;
      readonly branch: string | null;
      readonly sessionId: string;
      readonly pid: number;
      readonly editingFile: string | null;
      readonly lastActivityAt: string;
      readonly state: 'occupied';
      readonly orphan: true;
    };

/** これ未満の放置は通常の応答待ちと区別できないため表示しない。 */
const IDLE_DISPLAY_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * クレームの最終活動からの経過を表示用文字列にする。解放判定には使わない。
 *
 * `updatedAt` はツール実行フックでしか更新されないため「最終ツール実行時刻」であって
 * 生存時刻ではない。これを TTL 失効に使うと、プロンプトで入力待ちしている正常なセッションの
 * クレームが消え、衝突ゲートが無言で fail-open する。放置の可視化は表示に留める。
 */
export function describeIdleSince(updatedAt: string, nowMs: number): string | null {
  const updatedMs = Date.parse(updatedAt);
  if (Number.isNaN(updatedMs)) return null;

  const elapsedMs = nowMs - updatedMs;
  if (elapsedMs < IDLE_DISPLAY_THRESHOLD_MS) return null;

  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 60) return `最終活動 ${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `最終活動 ${hours}時間前`;
  return `最終活動 ${Math.floor(hours / 24)}日前`;
}

function emptyWorktree(): WorktreeInfo {
  return {
    path: '',
    head: null,
    branch: null,
    detached: false,
    bare: false,
  };
}

function finishWorktree(current: WorktreeInfo, worktrees: WorktreeInfo[]): void {
  if (current.path !== '') {
    worktrees.push(current);
  }
}

export function parseWorktreeList(porcelainOutput: string): WorktreeInfo[] {
  const worktrees: WorktreeInfo[] = [];
  let current = emptyWorktree();

  for (const line of porcelainOutput.split(/\r?\n/)) {
    if (line === '') {
      finishWorktree(current, worktrees);
      current = emptyWorktree();
      continue;
    }
    if (line.startsWith('worktree ')) {
      finishWorktree(current, worktrees);
      current = { ...emptyWorktree(), path: line.slice('worktree '.length) };
    } else if (line.startsWith('HEAD ')) {
      current = { ...current, head: line.slice('HEAD '.length) };
    } else if (line.startsWith('branch refs/heads/')) {
      current = { ...current, branch: line.slice('branch refs/heads/'.length) };
    } else if (line === 'detached') {
      current = { ...current, detached: true };
    } else if (line === 'bare') {
      current = { ...current, bare: true };
    }
  }

  finishWorktree(current, worktrees);
  return worktrees;
}

export function buildOwnershipRows(
  worktrees: readonly WorktreeInfo[],
  claims: readonly AirspaceClaim[],
): OwnershipRow[] {
  const matchedClaims = new Set<string>();
  const rows: OwnershipRow[] = [];

  for (const worktree of worktrees) {
    const owners = claims.filter((claim) => claim.worktree === worktree.path);
    if (owners.length === 0) {
      rows.push({
        worktreePath: worktree.path,
        branch: worktree.branch,
        sessionId: null,
        pid: null,
        editingFile: null,
        lastActivityAt: null,
        state: 'free',
        orphan: false,
      });
      continue;
    }

    for (const owner of owners) {
      matchedClaims.add(owner.sessionId);
      rows.push({
        worktreePath: worktree.path,
        branch: worktree.branch ?? owner.branch,
        sessionId: owner.sessionId,
        pid: owner.pid,
        editingFile: owner.file === '' ? null : owner.file,
        lastActivityAt: owner.updatedAt,
        state: 'occupied',
        orphan: false,
      });
    }
  }

  for (const claim of claims) {
    if (matchedClaims.has(claim.sessionId)) continue;
    rows.push({
      worktreePath: claim.worktree,
      branch: claim.branch === '' ? null : claim.branch,
      sessionId: claim.sessionId,
      pid: claim.pid,
      editingFile: claim.file === '' ? null : claim.file,
      lastActivityAt: claim.updatedAt,
      state: 'occupied',
      orphan: true,
    });
  }

  return rows;
}

