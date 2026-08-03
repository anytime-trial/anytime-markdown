import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type {
  AlignmentInput,
  ISpecDocIndex,
  SpecDocRef,
  SpecUpdateStatus,
} from '@anytime-markdown/trail-core';
import type Database from 'better-sqlite3';

import { type DbLogger, noopDbLogger } from './DbLogger';
import { unquoteGitPath } from './gitPath';

export interface SpecDocIndexOptions {
  /** `session` / `range` スコープでのみ必要。`worktree` スコープは git だけで完結する */
  readonly db?: Database.Database;
  readonly docsRepoRoot: string;
  readonly gitRepoRoot: string;
  readonly docsRepoName?: string;
  readonly specSubDir?: string;
  readonly logger?: DbLogger;
}

interface RepoRow {
  readonly repo_id: number;
}

interface FilePathRow {
  readonly file_path: string;
}

const DEFAULT_DOCS_REPO_NAME = 'anytime-markdown-docs';
const DEFAULT_SPEC_SUB_DIR = 'spec';

export class SpecDocIndex implements ISpecDocIndex {
  private readonly db: Database.Database | undefined;
  private readonly docsRepoRoot: string;
  private readonly gitRepoRoot: string;
  private readonly docsRepoName: string;
  private readonly specSubDir: string;
  private readonly logger: DbLogger;
  private docsRepoId: number | null = null;
  private indexByElementId: Map<string, SpecDocRef[]> | null = null;
  private worktreeChanges: ReadonlySet<string> | null = null;
  /** 未解決は undefined、解決済みで未取込は null（キャッシュと「未取込」を区別する） */
  private docsIngestedThrough: string | null | undefined = undefined;
  private warnedMissingResolutionTable = false;
  private readonly gitCommitTimeByRef = new Map<string, string | null>();

  constructor(options: SpecDocIndexOptions) {
    this.db = options.db;
    this.docsRepoRoot = options.docsRepoRoot;
    this.gitRepoRoot = options.gitRepoRoot;
    this.docsRepoName = options.docsRepoName ?? DEFAULT_DOCS_REPO_NAME;
    this.specSubDir = options.specSubDir ?? DEFAULT_SPEC_SUB_DIR;
    this.logger = options.logger ?? noopDbLogger;
  }

  async findByC4Element(elementId: string): Promise<readonly SpecDocRef[]> {
    if (!this.indexByElementId) {
      this.indexByElementId = this.buildIndex();
    }

    return this.indexByElementId.get(elementId) ?? [];
  }

  async wasUpdatedIn(specPath: string, input: AlignmentInput): Promise<SpecUpdateStatus> {
    if (input.scope === 'session') {
      return this.wasUpdatedInSession(specPath, input.sessionId);
    }

    if (input.scope === 'worktree') {
      return this.listWorktreeChanges().has(specPath) ? 'updated' : 'not-updated';
    }

    return this.wasUpdatedInRange(specPath, input.fromRef, input.toRef);
  }

  /**
   * 設計書リポジトリ（コードとは別リポジトリ）の未コミット変更を集める。DB は参照しない。
   * 新規設計書は untracked として現れるため、`diff HEAD` だけでは取りこぼす。
   */
  private listWorktreeChanges(): ReadonlySet<string> {
    if (this.worktreeChanges) return this.worktreeChanges;

    const changes = new Set<string>();
    const outputs = [
      this.runGitInDocs(['diff', 'HEAD', '--name-only', '--no-renames']),
      this.runGitInDocs(['ls-files', '--others', '--exclude-standard']),
    ];

    for (const output of outputs) {
      for (const line of (output ?? '').split('\n')) {
        if (line.trim().length === 0) continue;
        changes.add(unquoteGitPath(line.trim()));
      }
    }

    this.worktreeChanges = changes;
    return changes;
  }

  private runGitInDocs(args: readonly string[]): string | null {
    try {
      return execFileSync('git', [...args], {
        cwd: this.docsRepoRoot,
        encoding: 'utf-8',
        timeout: 30_000,
        stdio: 'pipe',
      });
    } catch (error) {
      this.logger.warn(`Failed to run git ${args.join(' ')} in docs repository: ${formatError(error)}`);
      return null;
    }
  }

  private wasUpdatedInSession(specPath: string, sessionId: string): SpecUpdateStatus {
    // 取込カバレッジの検査を先に行う。設計書リポジトリの commit 解決が当該セッションで
    // 一度も走っていなければ、行が無いのは「更新していない」からではなく「取り込んで
    // いない」からであり、判定できない。
    if (!this.isDocsCommitResolutionDone(sessionId)) return 'unknown';

    const rows = this.requireDb('session').prepare(`
      SELECT cf.file_path FROM commit_files cf
      JOIN session_commits sc
        ON sc.commit_hash = cf.commit_hash AND sc.repo_id = cf.repo_id
      WHERE sc.session_id = ? AND cf.repo_id = ?
    `).all(sessionId, this.getDocsRepoId()) as FilePathRow[];

    return hasMatchingGitPath(rows, specPath) ? 'updated' : 'not-updated';
  }

  private wasUpdatedInRange(specPath: string, fromRef: string, toRef: string): SpecUpdateStatus {
    const fromTime = this.resolveGitCommitTime(fromRef);
    const toTime = this.resolveGitCommitTime(toRef);
    // ref を解決できなければ範囲そのものが確定しない（未更新の証拠ではない）。
    if (!fromTime || !toTime) return 'unknown';

    const [startTime, endTime] = fromTime <= toTime ? [fromTime, toTime] : [toTime, fromTime];

    // 取込済みコミットが範囲より前で止まっていれば、範囲内の行が無いのは取込欠落による。
    const ingestedThrough = this.getDocsIngestedThrough();
    if (!ingestedThrough || ingestedThrough < startTime) return 'unknown';

    const rows = this.requireDb('range').prepare(`
      SELECT cf.file_path FROM commit_files cf
      JOIN session_commits sc
        ON sc.commit_hash = cf.commit_hash AND sc.repo_id = cf.repo_id
      WHERE cf.repo_id = ?
        AND sc.committed_at >= ? AND sc.committed_at <= ?
    `).all(this.getDocsRepoId(), startTime, endTime) as FilePathRow[];

    return hasMatchingGitPath(rows, specPath) ? 'updated' : 'not-updated';
  }

  /**
   * 設計書リポジトリの commit 解決が当該セッションで実行済みか。
   *
   * `session_commit_resolutions` を持たない旧スキーマの DB では判定材料が無いため
   * 未解決（= `unknown` 側）として扱い、警告を 1 度だけ残す。
   */
  private isDocsCommitResolutionDone(sessionId: string): boolean {
    const db = this.requireDb('session');
    if (!this.hasTable('session_commit_resolutions')) {
      if (!this.warnedMissingResolutionTable) {
        this.warnedMissingResolutionTable = true;
        this.logger.warn(
          'session_commit_resolutions table is missing; cannot verify spec commit ingestion coverage',
        );
      }
      return false;
    }

    const row = db.prepare(
      'SELECT 1 AS present FROM session_commit_resolutions WHERE session_id = ? AND repo_id = ? LIMIT 1',
    ).get(sessionId, this.getDocsRepoId()) as { present: number } | undefined;

    return row !== undefined;
  }

  /** 設計書リポジトリで取り込み済みの最新コミット時刻（未取込なら null）。 */
  private getDocsIngestedThrough(): string | null {
    if (this.docsIngestedThrough !== undefined) return this.docsIngestedThrough;

    const row = this.requireDb('range').prepare(
      'SELECT MAX(committed_at) AS latest FROM session_commits WHERE repo_id = ?',
    ).get(this.getDocsRepoId()) as { latest: string | null } | undefined;

    this.docsIngestedThrough = row?.latest ?? null;
    return this.docsIngestedThrough;
  }

  private hasTable(tableName: string): boolean {
    const row = this.requireDb('session').prepare(
      "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    ).get(tableName) as { present: number } | undefined;

    return row !== undefined;
  }

  private buildIndex(): Map<string, SpecDocRef[]> {
    const index = new Map<string, SpecDocRef[]>();
    const specRoot = path.join(this.docsRepoRoot, this.specSubDir);

    for (const filePath of walkMarkdownFiles(specRoot, this.logger)) {
      let c4Scope: readonly string[];
      try {
        c4Scope = extractC4ScopeFromFrontmatter(fs.readFileSync(filePath, 'utf-8'));
      } catch (error) {
        this.logger.warn(`Failed to read spec document frontmatter: ${filePath}: ${formatError(error)}`);
        continue;
      }

      if (c4Scope.length === 0) continue;

      const specPath = path.relative(this.docsRepoRoot, filePath).replaceAll(path.sep, '/');
      const ref: SpecDocRef = { specPath, c4Scope };
      for (const elementId of c4Scope) {
        const refs = index.get(elementId);
        if (refs) {
          refs.push(ref);
        } else {
          index.set(elementId, [ref]);
        }
      }
    }

    for (const refs of index.values()) {
      refs.sort((left, right) => left.specPath.localeCompare(right.specPath));
    }

    return index;
  }

  private requireDb(scope: string): Database.Database {
    if (!this.db) {
      throw new Error(`SpecDocIndex requires a trail.db handle for ${scope} scope`);
    }

    return this.db;
  }

  private getDocsRepoId(): number {
    if (this.docsRepoId !== null) return this.docsRepoId;

    const row = this.requireDb('session').prepare('SELECT repo_id FROM repos WHERE repo_name = ?')
      .get(this.docsRepoName) as RepoRow | undefined;
    if (!row) {
      throw new Error(`Repository not found in repos table: ${this.docsRepoName}`);
    }

    this.docsRepoId = row.repo_id;
    return row.repo_id;
  }

  private resolveGitCommitTime(ref: string): string | null {
    if (this.gitCommitTimeByRef.has(ref)) {
      return this.gitCommitTimeByRef.get(ref) ?? null;
    }

    try {
      const output = execFileSync('git', ['show', '-s', '--format=%cI', ref], {
        cwd: this.gitRepoRoot,
        encoding: 'utf-8',
        timeout: 30_000,
        stdio: 'pipe',
      }).trim();
      const isoTime = new Date(output).toISOString();
      this.gitCommitTimeByRef.set(ref, isoTime);
      return isoTime;
    } catch (error) {
      this.logger.warn(`Failed to resolve git commit time for ref ${ref}: ${formatError(error)}`);
      this.gitCommitTimeByRef.set(ref, null);
      return null;
    }
  }
}

export function extractC4ScopeFromFrontmatter(content: string): readonly string[] {
  const lines = content.split(/\r?\n/);
  if (lines.length === 0 || !lines[0].startsWith('---')) return [];

  return parseC4ScopeLines(readFrontmatterLines(lines));
}

function readFrontmatterLines(lines: readonly string[]): readonly string[] {
  const frontmatterLines: string[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].startsWith('---')) break;
    frontmatterLines.push(lines[index]);
  }

  return frontmatterLines;
}

function parseC4ScopeLines(frontmatterLines: readonly string[]): readonly string[] {
  const c4Scope: string[] = [];
  let inC4Scope = false;

  for (const line of frontmatterLines) {
    if (!inC4Scope) {
      const parsedLine = parseC4ScopeStartLine(line);
      c4Scope.push(...parsedLine.values);
      inC4Scope = parsedLine.startsBlock;
      continue;
    }

    if (/^\S/.test(line)) break;

    const match = line.match(/^\s*-\s*(?:"([^"]+)"|'([^']+)'|(.+?))\s*$/);
    if (!match) continue;

    const value = (match[1] ?? match[2] ?? match[3]).trim();
    if (value.length > 0) c4Scope.push(value);
  }

  return c4Scope;
}

function parseC4ScopeStartLine(line: string): { readonly values: readonly string[]; readonly startsBlock: boolean } {
  const flowMatch = line.match(/^c4Scope:\s*\[(.*)]\s*$/);
  if (flowMatch) {
    return { values: parseFlowStyleList(flowMatch[1]), startsBlock: false };
  }

  return { values: [], startsBlock: /^c4Scope:\s*$/.test(line) };
}

function parseFlowStyleList(value: string): readonly string[] {
  return value
    .split(',')
    .map((item) => item.trim().replace(/^["']|["']$/g, '').trim())
    .filter((item) => item.length > 0);
}

function hasMatchingGitPath(rows: readonly FilePathRow[], expectedPath: string): boolean {
  return rows.some((row) => unquoteGitPath(row.file_path) === expectedPath);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function walkMarkdownFiles(root: string, logger: DbLogger): readonly string[] {
  const results: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      logger.warn(`Failed to read spec directory: ${dir}: ${formatError(error)}`);
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  }

  return results.sort((left, right) => left.localeCompare(right));
}
