// ExecFileGitService.ts — IGitService implementation using execFileSync

import type {
  IGitService,
  MergeCommitEntry,
  FileStatEntry,
} from '@anytime-markdown/trail-core';
import { isCodeFile } from '@anytime-markdown/trail-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SNAPSHOT_SKIP_DIRS = new Set([
  '.git',
  '.claude',
  '.vscode',
  '.worktrees',
  '.next',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
]);

function countTextLines(text: string): number {
  if (text.length === 0) return 0;
  const matches = text.match(/\r\n|\r|\n/g);
  const lineBreaks = matches?.length ?? 0;
  return lineBreaks > 0 ? lineBreaks : 1;
}

function shouldSkipSnapshotPath(relativePath: string): boolean {
  const parts = relativePath.split(/[\\/]/);
  return parts.some((part) => SNAPSHOT_SKIP_DIRS.has(part));
}

function countSnapshotLines(rootDir: string): number {
  let total = 0;
  const stack = [rootDir];

  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(rootDir, fullPath);
      if (shouldSkipSnapshotPath(relativePath)) continue;
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile() || !isCodeFile(relativePath.replaceAll(path.sep, '/'))) continue;

      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        total += countTextLines(content);
      } catch {
        // unreadable/binary-like files are skipped
      }
    }
  }

  return total;
}

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

  getVersionTags(): readonly string[] {
    try {
      const output = execFileSync('git', [
        'tag', '-l', 'v*', '--sort=-version:refname',
      ], { encoding: 'utf-8', timeout: 10_000, cwd: this.gitRoot });
      return output.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
    } catch {
      return [];
    }
  }

  getTagCommitHash(tag: string): string {
    try {
      const output = execFileSync('git', [
        'rev-list', '-1', tag,
      ], { encoding: 'utf-8', timeout: 10_000, cwd: this.gitRoot });
      return output.trim();
    } catch {
      return '';
    }
  }

  getTagsAtCommit(commitHash: string): readonly string[] {
    try {
      const output = execFileSync('git', [
        'tag', '--points-at', commitHash,
      ], { encoding: 'utf-8', timeout: 10_000, cwd: this.gitRoot });
      return output.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
    } catch {
      return [];
    }
  }

  getTagDate(tag: string): string {
    try {
      const output = execFileSync('git', [
        'log', '-1', '--format=%aI', tag,
      ], { encoding: 'utf-8', timeout: 10_000, cwd: this.gitRoot });
      return toUTC(output.trim());
    } catch {
      return '';
    }
  }

  getCommitSubjects(fromTag: string, toTag: string): readonly string[] {
    try {
      const output = execFileSync('git', [
        'log', '--format=%s', `${fromTag}..${toTag}`,
      ], { encoding: 'utf-8', timeout: 10_000, cwd: this.gitRoot });
      return output.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
    } catch {
      return [];
    }
  }

  getDiffStats(fromTag: string, toTag: string): { filesChanged: number; linesAdded: number; linesDeleted: number } {
    try {
      const output = execFileSync('git', [
        'diff', '--shortstat', fromTag, toTag,
      ], { encoding: 'utf-8', timeout: 10_000, cwd: this.gitRoot });
      // Example: " 10 files changed, 500 insertions(+), 200 deletions(-)"
      const filesMatch = /(\d+) file/.exec(output);
      const addedMatch = /(\d+) insertion/.exec(output);
      const deletedMatch = /(\d+) deletion/.exec(output);
      return {
        filesChanged: filesMatch ? Number.parseInt(filesMatch[1], 10) : 0,
        linesAdded: addedMatch ? Number.parseInt(addedMatch[1], 10) : 0,
        linesDeleted: deletedMatch ? Number.parseInt(deletedMatch[1], 10) : 0,
      };
    } catch {
      return { filesChanged: 0, linesAdded: 0, linesDeleted: 0 };
    }
  }

  getFileStatsByRange(fromTag: string, toTag: string): readonly FileStatEntry[] {
    const execOpts = { encoding: 'utf-8' as const, timeout: 30_000 };
    const fileMap = new Map<string, { added: number; deleted: number; changeType: string }>();

    // 行数集計
    try {
      const numstat = execFileSync('git', [
        'diff', '--numstat', fromTag, toTag,
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
      return [];
    }

    // 変更種別（A/M/D/R）
    try {
      const nameStatus = execFileSync('git', [
        'diff', '--name-status', fromTag, toTag,
      ], { ...execOpts, cwd: this.gitRoot });

      for (const line of nameStatus.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split('\t');
        if (parts.length < 2) continue;
        const status = parts[0].charAt(0);
        const filePath = status === 'R' && parts[2] ? parts[2] : parts[1];
        if (!filePath) continue;
        const changeType =
          status === 'A' ? 'added' :
          status === 'D' ? 'deleted' :
          status === 'R' ? 'renamed' : 'modified';
        const existing = fileMap.get(filePath) ?? { added: 0, deleted: 0, changeType };
        existing.changeType = changeType;
        fileMap.set(filePath, existing);
      }
    } catch {
      // use defaults
    }

    return [...fileMap.entries()].map(([filePath, s]) => ({
      filePath,
      linesAdded: s.added,
      linesDeleted: s.deleted,
      changeType: s.changeType,
    }));
  }

  getSnapshotLineCount(tag: string): number {
    const commitHash = this.getTagCommitHash(tag);
    if (!commitHash) return 0;

    const worktreeRoot = fs.mkdtempSync(path.join(os.tmpdir(), `trail-snapshot-${tag.replaceAll('/', '-')}-`));
    try {
      execFileSync('git', ['worktree', 'add', '--detach', worktreeRoot, commitHash], {
        encoding: 'utf-8',
        timeout: 30_000,
        cwd: this.gitRoot,
        stdio: 'pipe',
      });
      return countSnapshotLines(worktreeRoot);
    } catch {
      return 0;
    } finally {
      try {
        execFileSync('git', ['worktree', 'remove', worktreeRoot, '--force'], {
          encoding: 'utf-8',
          timeout: 30_000,
          cwd: this.gitRoot,
          stdio: 'pipe',
        });
      } catch {
        try {
          fs.rmSync(worktreeRoot, { recursive: true, force: true });
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }

  getHeadCommit(): string {
    try {
      const output = execFileSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf-8', timeout: 10_000, cwd: this.gitRoot,
      });
      return output.trim();
    } catch {
      return '';
    }
  }

  getChangedPackages(fromTag: string, toTag: string): readonly string[] {
    try {
      const output = execFileSync('git', [
        'diff', '--name-only', fromTag, toTag,
      ], { encoding: 'utf-8', timeout: 10_000, cwd: this.gitRoot });
      const packages = new Set<string>();
      for (const line of output.split('\n')) {
        const match = /^packages\/([^/]+)\//.exec(line.trim());
        if (match) packages.add(match[1]);
      }
      return [...packages];
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
