import type Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type {
  AlignmentInput,
  ISpecDocIndex,
  SpecDocRef,
} from '@anytime-markdown/trail-core';

export interface SpecDocIndexOptions {
  readonly db: Database.Database;
  readonly docsRepoRoot: string;
  readonly gitRepoRoot: string;
  readonly docsRepoName?: string;
  readonly specSubDir?: string;
}

interface RepoRow {
  readonly repo_id: number;
}

const DEFAULT_DOCS_REPO_NAME = 'anytime-markdown-docs';
const DEFAULT_SPEC_SUB_DIR = 'spec';

export class SpecDocIndex implements ISpecDocIndex {
  private readonly db: Database.Database;
  private readonly docsRepoRoot: string;
  private readonly gitRepoRoot: string;
  private readonly docsRepoName: string;
  private readonly specSubDir: string;
  private docsRepoId: number | null = null;
  private indexByElementId: Map<string, SpecDocRef[]> | null = null;

  constructor(options: SpecDocIndexOptions) {
    this.db = options.db;
    this.docsRepoRoot = options.docsRepoRoot;
    this.gitRepoRoot = options.gitRepoRoot;
    this.docsRepoName = options.docsRepoName ?? DEFAULT_DOCS_REPO_NAME;
    this.specSubDir = options.specSubDir ?? DEFAULT_SPEC_SUB_DIR;
  }

  async findByC4Element(elementId: string): Promise<readonly SpecDocRef[]> {
    if (!this.indexByElementId) {
      this.indexByElementId = this.buildIndex();
    }

    return this.indexByElementId.get(elementId) ?? [];
  }

  async wasUpdatedIn(specPath: string, input: AlignmentInput): Promise<boolean> {
    if (input.scope === 'session') {
      return this.wasUpdatedInSession(specPath, input.sessionId);
    }

    return this.wasUpdatedInRange(specPath, input.fromRef, input.toRef);
  }

  private wasUpdatedInSession(specPath: string, sessionId: string): boolean {
    const row = this.db.prepare(`
      SELECT 1 FROM commit_files cf
      JOIN session_commits sc
        ON sc.commit_hash = cf.commit_hash AND sc.repo_id = cf.repo_id
      WHERE sc.session_id = ? AND cf.repo_id = ? AND cf.file_path = ?
      LIMIT 1
    `).get(sessionId, this.getDocsRepoId(), specPath);

    return Boolean(row);
  }

  private wasUpdatedInRange(specPath: string, fromRef: string, toRef: string): boolean {
    const fromTime = this.resolveGitCommitTime(fromRef);
    const toTime = this.resolveGitCommitTime(toRef);
    const [startTime, endTime] = fromTime <= toTime ? [fromTime, toTime] : [toTime, fromTime];

    const row = this.db.prepare(`
      SELECT 1 FROM commit_files cf
      JOIN session_commits sc
        ON sc.commit_hash = cf.commit_hash AND sc.repo_id = cf.repo_id
      WHERE cf.repo_id = ? AND cf.file_path = ?
        AND sc.committed_at >= ? AND sc.committed_at <= ?
      LIMIT 1
    `).get(this.getDocsRepoId(), specPath, startTime, endTime);

    return Boolean(row);
  }

  private buildIndex(): Map<string, SpecDocRef[]> {
    const index = new Map<string, SpecDocRef[]>();
    const specRoot = path.join(this.docsRepoRoot, this.specSubDir);

    for (const filePath of walkMarkdownFiles(specRoot)) {
      let c4Scope: readonly string[];
      try {
        c4Scope = extractC4ScopeFromFrontmatter(fs.readFileSync(filePath, 'utf-8'));
      } catch (error) {
        console.warn(`Failed to read spec document frontmatter: ${filePath}`, error);
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

  private getDocsRepoId(): number {
    if (this.docsRepoId !== null) return this.docsRepoId;

    const row = this.db.prepare('SELECT repo_id FROM repos WHERE repo_name = ?')
      .get(this.docsRepoName) as RepoRow | undefined;
    if (!row) {
      throw new Error(`Repository not found in repos table: ${this.docsRepoName}`);
    }

    this.docsRepoId = row.repo_id;
    return row.repo_id;
  }

  private resolveGitCommitTime(ref: string): string {
    const output = execFileSync('git', ['show', '-s', '--format=%cI', ref], {
      cwd: this.gitRepoRoot,
      encoding: 'utf-8',
      timeout: 30_000,
      stdio: 'pipe',
    }).trim();

    return new Date(output).toISOString();
  }
}

export function extractC4ScopeFromFrontmatter(content: string): readonly string[] {
  const lines = content.split(/\r?\n/);
  if (lines.length === 0 || !lines[0].startsWith('---')) return [];

  const frontmatterLines: string[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].startsWith('---')) break;
    frontmatterLines.push(lines[index]);
  }

  const c4Scope: string[] = [];
  let inC4Scope = false;

  for (const line of frontmatterLines) {
    if (!inC4Scope) {
      if (/^c4Scope:\s*$/.test(line)) {
        inC4Scope = true;
      }
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

function walkMarkdownFiles(root: string): readonly string[] {
  const results: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      console.warn(`Failed to read spec directory: ${dir}`, error);
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
