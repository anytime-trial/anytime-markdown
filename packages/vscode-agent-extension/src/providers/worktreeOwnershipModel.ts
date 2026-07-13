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
      readonly state: 'occupied';
      readonly orphan: false;
    }
  | {
      readonly worktreePath: string;
      readonly branch: string | null;
      readonly sessionId: null;
      readonly pid: null;
      readonly editingFile: null;
      readonly state: 'free';
      readonly orphan: false;
    }
  | {
      readonly worktreePath: string;
      readonly branch: string | null;
      readonly sessionId: string;
      readonly pid: number;
      readonly editingFile: string | null;
      readonly state: 'occupied';
      readonly orphan: true;
    };

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
      state: 'occupied',
      orphan: true,
    });
  }

  return rows;
}

