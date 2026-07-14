import type Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';

import type {
  AlignmentInput,
  ChangedFile,
  IFileChangeResolver,
} from '@anytime-markdown/trail-core';

export interface FileChangeResolverOptions {
  readonly db: Database.Database;
  readonly gitRepoRoot: string;
  readonly codeRepoName?: string;
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
    const filePath = parts.slice(2).join('\t');
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
  private readonly db: Database.Database;
  private readonly gitRepoRoot: string;
  private readonly codeRepoName: string;
  private codeRepoId: number | null = null;

  constructor(options: FileChangeResolverOptions) {
    this.db = options.db;
    this.gitRepoRoot = options.gitRepoRoot;
    this.codeRepoName = options.codeRepoName ?? DEFAULT_CODE_REPO_NAME;
  }

  async resolve(input: AlignmentInput): Promise<readonly ChangedFile[]> {
    if (input.scope === 'session') {
      return this.resolveSession(input.sessionId);
    }

    return this.resolveRange(input.fromRef, input.toRef);
  }

  private resolveSession(sessionId: string): readonly ChangedFile[] {
    const repoId = this.getCodeRepoId();
    const rows = this.db.prepare(`
      SELECT commit_hash
      FROM session_commits
      WHERE session_id = ? AND repo_id = ?
    `).all(sessionId, repoId) as CommitRow[];

    const aggregate = new Map<string, MutableChangedFile>();
    for (const row of rows) {
      this.applyGitOutputs(
        aggregate,
        this.runGit(['show', '--numstat', '--format=', '--no-renames', row.commit_hash]),
        this.runGit(['show', '--unified=0', '--format=', '--no-renames', row.commit_hash]),
      );
    }

    return toChangedFiles(aggregate);
  }

  private resolveRange(fromRef: string, toRef: string): readonly ChangedFile[] {
    const aggregate = new Map<string, MutableChangedFile>();
    this.applyGitOutputs(
      aggregate,
      this.runGit(['diff', '--numstat', '--no-renames', `${fromRef}..${toRef}`]),
      this.runGit(['diff', '--unified=0', '--no-renames', `${fromRef}..${toRef}`]),
    );
    return toChangedFiles(aggregate);
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

  private getCodeRepoId(): number {
    if (this.codeRepoId !== null) return this.codeRepoId;

    const row = this.db.prepare('SELECT repo_id FROM repos WHERE repo_name = ?')
      .get(this.codeRepoName) as RepoRow | undefined;
    if (!row) {
      throw new Error(`Repository not found in repos table: ${this.codeRepoName}`);
    }

    this.codeRepoId = row.repo_id;
    return row.repo_id;
  }

  private runGit(args: readonly string[]): string {
    return execFileSync('git', [...args], {
      cwd: this.gitRepoRoot,
      encoding: 'utf-8',
      timeout: 30_000,
      stdio: 'pipe',
    });
  }
}

function parseStatNumber(value: string): number {
  if (value === '-') return 0;
  return Number.parseInt(value, 10) || 0;
}

function parsePatchPath(value: string, prefix: 'a/' | 'b/'): string | null {
  const path = value.trim();
  if (path === '/dev/null') return null;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
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
