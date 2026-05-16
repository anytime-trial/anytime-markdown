import type { WorktreeEntry } from './types';

interface MutableWorktreeEntry {
  path?: string;
  branch?: string;
  isMain?: boolean;
}

export function parseWorktreeList(output: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  let current: MutableWorktreeEntry = {};
  let isFirst = true;
  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current.path) {
        entries.push({
          path: current.path,
          branch: current.branch ?? '(detached)',
          isMain: current.isMain ?? false,
        });
      }
      current = { path: line.slice('worktree '.length).trim(), isMain: isFirst };
      isFirst = false;
    } else if (line.startsWith('branch refs/heads/')) {
      current.branch = line.slice('branch refs/heads/'.length);
    }
  }
  if (current.path) {
    entries.push({
      path: current.path,
      branch: current.branch ?? '(detached)',
      isMain: current.isMain ?? false,
    });
  }
  return entries;
}
