// ExecFileGitService.ts — IGitService implementation using execFileSync

import type {
  IGitService,
  MergeCommitEntry,
  FileStatEntry,
} from '@anytime-markdown/trail-core';
import { execFileSync } from 'node:child_process';

function toUTC(iso: string): string {
  try {
    return new Date(iso).toISOString();
  } catch {
    return iso;
  }
}

export class ExecFileGitService implements IGitService {
  constructor(private readonly gitRoot: string) {}

  getMergeCommits(): readonly MergeCommitEntry[] {
    const execOpts = { encoding: 'utf-8' as const, timeout: 30_000 };
    const logFormat = '%H%x00%s%x00%P%x00%aI%x1e';

    let logOutput = '';
    try {
      logOutput = execFileSync('git', [
        'log', '--merges', '--all',
        `--format=${logFormat}`,
      ], { ...execOpts, cwd: this.gitRoot });
    } catch {
      return [];
    }

    const entries = logOutput
      .split('\x1e')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const results: MergeCommitEntry[] = [];
    for (const entry of entries) {
      const parts = entry.split('\x00');
      if (parts.length < 4) continue;
      results.push({
        hash: parts[0],
        subject: parts[1],
        parentHashes: parts[2].split(' '),
        mergedAt: toUTC(parts[3]),
      });
    }
    return results;
  }

  getCommitsInRange(base: string, head: string): readonly string[] {
    try {
      const output = execFileSync('git', [
        'log', `${base}..${head}`,
        '--no-merges',
        '--format=%H',
      ], { encoding: 'utf-8', timeout: 10_000, cwd: this.gitRoot });

      return output
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    } catch {
      return [];
    }
  }

  getAggregateFileStats(commitHashes: readonly string[]): readonly FileStatEntry[] {
    const execOpts = { encoding: 'utf-8' as const, timeout: 10_000 };
    const fileMap = new Map<string, { added: number; deleted: number; changeType: string }>();

    for (const hash of commitHashes) {
      // Get line stats
      try {
        const numstat = execFileSync('git', [
          'diff', '--numstat', `${hash}^..${hash}`,
        ], { ...execOpts, cwd: this.gitRoot });

        for (const line of numstat.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const [added, deleted, filePath] = trimmed.split('\t');
          if (!filePath) continue;

          const existing = fileMap.get(filePath) ?? { added: 0, deleted: 0, changeType: 'modified' };
          if (added !== '-') existing.added += Number.parseInt(added, 10) || 0;
          if (deleted !== '-') existing.deleted += Number.parseInt(deleted, 10) || 0;
          fileMap.set(filePath, existing);
        }
      } catch {
        // Initial commit or other error — skip
      }

      // Get change types (A/M/D/R)
      try {
        const nameStatus = execFileSync('git', [
          'diff', '--name-status', `${hash}^..${hash}`,
        ], { ...execOpts, cwd: this.gitRoot });

        for (const line of nameStatus.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const parts = trimmed.split('\t');
          if (parts.length < 2) continue;

          const status = parts[0].charAt(0);
          const filePath = status === 'R' && parts[2] ? parts[2] : parts[1];
          const existing = fileMap.get(filePath);
          if (!existing) continue;

          const typeMap: Record<string, string> = {
            A: 'added', M: 'modified', D: 'deleted', R: 'renamed',
          };
          existing.changeType = typeMap[status] ?? 'modified';
        }
      } catch {
        // Skip — change types remain as default 'modified'
      }
    }

    return [...fileMap.entries()].map(([filePath, stats]) => ({
      filePath,
      linesAdded: stats.added,
      linesDeleted: stats.deleted,
      changeType: stats.changeType,
    }));
  }
}
