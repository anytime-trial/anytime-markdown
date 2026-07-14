import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type {
  AlignmentInput,
  ChangedFile,
  IFileChangeResolver,
} from '@anytime-markdown/trail-core';
import type Database from 'better-sqlite3';

import { type DbLogger, noopDbLogger } from './DbLogger';
import { unquoteGitPath } from './gitPath';

export interface FileChangeResolverOptions {
  /** `session` / `range` スコープでのみ必要。`worktree` スコープは git だけで完結する */
  readonly db?: Database.Database;
  readonly gitRepoRoot: string;
  readonly codeRepoName?: string;
  readonly logger?: DbLogger;
}

interface NumstatEntry {
  readonly filePath: string;
  readonly linesAdded: number;
  readonly linesDeleted: number;
}

interface ExportLineCounts {
  added: number;
  removed: number;
}

interface RepoRow {
  readonly repo_id: number;
}

interface CommitRow {
  readonly commit_hash: string;
}

interface MutableChangedFile {
  filePath: string;
  linesAdded: number;
  linesDeleted: number;
  addedExportLines: number;
  removedExportLines: number;
}

const DEFAULT_CODE_REPO_NAME = 'anytime-markdown';

export function parseNumstat(stdout: string): readonly NumstatEntry[] {
  const entries: NumstatEntry[] = [];

  for (const line of stdout.split('\n')) {
    if (line.trim().length === 0) continue;

    const parts = line.split('\t');
    if (parts.length < 3) continue;

    const [added, deleted] = parts;
    const filePath = unquoteGitPath(parts.slice(2).join('\t'));
    entries.push({
      filePath,
      linesAdded: parseStatNumber(added),
      linesDeleted: parseStatNumber(deleted),
    });
  }

  return entries;
}

export function countExportLinesByFile(patch: string): Map<string, ExportLineCounts> {
  const countsByFile = new Map<string, ExportLineCounts>();
  let currentFile: string | null = null;
  let pendingOldFile: string | null = null;

  for (const line of patch.split('\n')) {
    if (line.startsWith('--- ')) {
      pendingOldFile = parsePatchPath(line.slice(4), 'a/');
      continue;
    }

    if (line.startsWith('+++ ')) {
      currentFile = parsePatchPath(line.slice(4), 'b/') ?? pendingOldFile;
      continue;
    }

    if (!currentFile || !/\bexport\b/.test(line)) continue;

    if (line.startsWith('+') && !line.startsWith('+++')) {
      incrementExportCount(countsByFile, currentFile, 'added');
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      incrementExportCount(countsByFile, currentFile, 'removed');
    }
  }

  return countsByFile;
}

export class FileChangeResolver implements IFileChangeResolver {
  private readonly db: Database.Database | undefined;
  private readonly gitRepoRoot: string;
  private readonly codeRepoName: string;
  private readonly logger: DbLogger;
  private codeRepoId: number | null = null;

  constructor(options: FileChangeResolverOptions) {
    this.db = options.db;
    this.gitRepoRoot = options.gitRepoRoot;
    this.codeRepoName = options.codeRepoName ?? DEFAULT_CODE_REPO_NAME;
    this.logger = options.logger ?? noopDbLogger;
  }

  async resolve(input: AlignmentInput): Promise<readonly ChangedFile[]> {
    if (input.scope === 'session') {
      return this.resolveSession(input.sessionId);
    }

    if (input.scope === 'worktree') {
      return this.resolveWorktree();
    }

    return this.resolveRange(input.fromRef, input.toRef);
  }

  private resolveSession(sessionId: string): readonly ChangedFile[] {
    const db = this.requireDb('session');
    const repoId = this.getCodeRepoId();
    const rows = db.prepare(`
      SELECT commit_hash
      FROM session_commits
      WHERE session_id = ? AND repo_id = ?
    `).all(sessionId, repoId) as CommitRow[];

    const aggregate = new Map<string, MutableChangedFile>();
    for (const row of rows) {
      const numstat = this.runGit(['show', '--numstat', '--format=', '--no-renames', row.commit_hash]);
      const patch = this.runGit(['show', '--unified=0', '--format=', '--no-renames', row.commit_hash]);
      if (numstat === null || patch === null) continue;

      this.applyGitOutputs(
        aggregate,
        numstat,
        patch,
      );
    }

    return toChangedFiles(aggregate);
  }

  private resolveRange(fromRef: string, toRef: string): readonly ChangedFile[] {
    const aggregate = new Map<string, MutableChangedFile>();
    const numstat = this.runGit(['diff', '--numstat', '--no-renames', `${fromRef}..${toRef}`]);
    const patch = this.runGit(['diff', '--unified=0', '--no-renames', `${fromRef}..${toRef}`]);
    if (numstat === null || patch === null) return [];

    this.applyGitOutputs(
      aggregate,
      numstat,
      patch,
    );
    return toChangedFiles(aggregate);
  }

  /**
   * 作業ツリー（未コミット変更）を対象にする。DB は参照しない（repos 行が無くても動く）。
   * 追跡済みファイルは `git diff HEAD`、新規ファイルは untracked 一覧から拾う
   * （新機能の追加は新規ファイルとして現れるため、untracked を落とすと検知漏れになる）。
   */
  private resolveWorktree(): readonly ChangedFile[] {
    const aggregate = new Map<string, MutableChangedFile>();
    const numstat = this.runGit(['diff', 'HEAD', '--numstat', '--no-renames']) ?? '';
    const patch = this.runGit(['diff', 'HEAD', '--unified=0', '--no-renames']) ?? '';

    this.applyGitOutputs(aggregate, numstat, patch);
    this.applyUntrackedFiles(aggregate);

    return toChangedFiles(aggregate);
  }

  private applyUntrackedFiles(aggregate: Map<string, MutableChangedFile>): void {
    const output = this.runGit(['ls-files', '--others', '--exclude-standard']);
    if (output === null) return;

    for (const line of output.split('\n')) {
      if (line.trim().length === 0) continue;

      const filePath = unquoteGitPath(line.trim());
      let content: string;
      try {
        content = fs.readFileSync(path.join(this.gitRepoRoot, filePath), 'utf-8');
      } catch (error) {
        this.logger.warn(`Failed to read untracked file: ${filePath}: ${formatError(error)}`);
        continue;
      }

      const lines = content.split('\n');
      if (lines.at(-1) === '') lines.pop();

      const file = getOrCreateChangedFile(aggregate, filePath);
      file.linesAdded += lines.length;
      file.addedExportLines += lines.filter((contentLine) => /\bexport\b/.test(contentLine)).length;
    }
  }

  private applyGitOutputs(
    aggregate: Map<string, MutableChangedFile>,
    numstat: string,
    patch: string,
  ): void {
    for (const entry of parseNumstat(numstat)) {
      const file = getOrCreateChangedFile(aggregate, entry.filePath);
      file.linesAdded += entry.linesAdded;
      file.linesDeleted += entry.linesDeleted;
    }

    for (const [filePath, counts] of countExportLinesByFile(patch)) {
      const file = getOrCreateChangedFile(aggregate, filePath);
      file.addedExportLines += counts.added;
      file.removedExportLines += counts.removed;
    }
  }

  private requireDb(scope: string): Database.Database {
    if (!this.db) {
      throw new Error(`FileChangeResolver requires a trail.db handle for ${scope} scope`);
    }

    return this.db;
  }

  private getCodeRepoId(): number {
    if (this.codeRepoId !== null) return this.codeRepoId;

    const row = this.requireDb('session').prepare('SELECT repo_id FROM repos WHERE repo_name = ?')
      .get(this.codeRepoName) as RepoRow | undefined;
    if (!row) {
      throw new Error(`Repository not found in repos table: ${this.codeRepoName}`);
    }

    this.codeRepoId = row.repo_id;
    return row.repo_id;
  }

  private runGit(args: readonly string[]): string | null {
    try {
      return execFileSync('git', [...args], {
        cwd: this.gitRepoRoot,
        encoding: 'utf-8',
        timeout: 30_000,
        stdio: 'pipe',
      });
    } catch (error) {
      this.logger.warn(`Failed to run git ${args.join(' ')}: ${formatError(error)}`);
      return null;
    }
  }
}

function parseStatNumber(value: string): number {
  if (value === '-') return 0;
  return Number.parseInt(value, 10) || 0;
}

function parsePatchPath(value: string, prefix: 'a/' | 'b/'): string | null {
  const filePath = unquoteGitPath(value.trim());
  if (filePath === '/dev/null') return null;
  return filePath.startsWith(prefix) ? filePath.slice(prefix.length) : filePath;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function incrementExportCount(
  countsByFile: Map<string, ExportLineCounts>,
  filePath: string,
  key: keyof ExportLineCounts,
): void {
  const counts = countsByFile.get(filePath) ?? { added: 0, removed: 0 };
  counts[key] += 1;
  countsByFile.set(filePath, counts);
}

function getOrCreateChangedFile(
  aggregate: Map<string, MutableChangedFile>,
  filePath: string,
): MutableChangedFile {
  const existing = aggregate.get(filePath);
  if (existing) return existing;

  const created: MutableChangedFile = {
    filePath,
    linesAdded: 0,
    linesDeleted: 0,
    addedExportLines: 0,
    removedExportLines: 0,
  };
  aggregate.set(filePath, created);
  return created;
}

function toChangedFiles(aggregate: ReadonlyMap<string, MutableChangedFile>): readonly ChangedFile[] {
  return [...aggregate.values()]
    .map((file) => ({ ...file }))
    .sort((left, right) => left.filePath.localeCompare(right.filePath));
}
