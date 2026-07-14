import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { SpecDocIndex } from '../SpecDocIndex';

function runGit(args: string[], cwd: string, env?: NodeJS.ProcessEnv): string {
  return execFileSync('git', args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf-8',
    stdio: 'pipe',
  });
}

function createDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE repos(repo_id INTEGER, repo_name TEXT);
    CREATE TABLE session_commits(
      session_id TEXT,
      commit_hash TEXT,
      commit_message TEXT,
      author TEXT,
      committed_at TEXT,
      is_ai_assisted INTEGER,
      files_changed INTEGER,
      lines_added INTEGER,
      lines_deleted INTEGER,
      repo_id INTEGER
    );
    CREATE TABLE commit_files(commit_hash TEXT, file_path TEXT, repo_id INTEGER);
  `);
  db.prepare('INSERT INTO repos(repo_id, repo_name) VALUES (?, ?)').run(9, 'anytime-markdown-docs');
  return db;
}

describe('SpecDocIndex.findByC4Element', () => {
  let docsRoot: string;
  let codeRoot: string;
  let db: Database.Database;

  beforeEach(() => {
    docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-spec-doc-index-docs-'));
    codeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-spec-doc-index-code-'));
    db = createDb();
  });

  afterEach(() => {
    db.close();
    fs.rmSync(docsRoot, { recursive: true, force: true });
    fs.rmSync(codeRoot, { recursive: true, force: true });
  });

  it('indexes c4Scope frontmatter and ignores docs without c4Scope', async () => {
    fs.mkdirSync(path.join(docsRoot, 'spec', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(docsRoot, 'spec', 'a.md'), [
      '---',
      'title: "A"',
      'c4Scope:',
      '  - "pkg_trail-core"',
      '  - pkg_trail-db',
      '---',
      '# A',
    ].join('\n'));
    fs.writeFileSync(path.join(docsRoot, 'spec', 'nested', 'b.md'), [
      '---',
      'title: "B"',
      '---',
      '# B',
    ].join('\n'));

    const index = new SpecDocIndex({ db, docsRepoRoot: docsRoot, gitRepoRoot: codeRoot });

    await expect(index.findByC4Element('pkg_trail-core')).resolves.toEqual([
      { specPath: 'spec/a.md', c4Scope: ['pkg_trail-core', 'pkg_trail-db'] },
    ]);
    await expect(index.findByC4Element('pkg_trail-db')).resolves.toEqual([
      { specPath: 'spec/a.md', c4Scope: ['pkg_trail-core', 'pkg_trail-db'] },
    ]);
    await expect(index.findByC4Element('pkg_missing')).resolves.toEqual([]);
  });
});

describe('SpecDocIndex.wasUpdatedIn', () => {
  let docsRoot: string;
  let codeRoot: string;
  let db: Database.Database;

  beforeEach(() => {
    docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-spec-doc-index-docs-'));
    codeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-spec-doc-index-code-'));
    db = createDb();
  });

  afterEach(() => {
    db.close();
    fs.rmSync(docsRoot, { recursive: true, force: true });
    fs.rmSync(codeRoot, { recursive: true, force: true });
  });

  it('detects spec updates in the same session', async () => {
    db.prepare(`
      INSERT INTO session_commits(
        session_id, commit_hash, commit_message, author, committed_at,
        is_ai_assisted, files_changed, lines_added, lines_deleted, repo_id
      ) VALUES (?, ?, '', '', ?, 0, 0, 0, 0, ?)
    `).run('session-1', 'docs-commit-1', '2026-07-14T00:00:00.000Z', 9);
    db.prepare('INSERT INTO commit_files(commit_hash, file_path, repo_id) VALUES (?, ?, ?)')
      .run('docs-commit-1', 'spec/a.md', 9);

    const index = new SpecDocIndex({ db, docsRepoRoot: docsRoot, gitRepoRoot: codeRoot });

    await expect(index.wasUpdatedIn('spec/a.md', { scope: 'session', sessionId: 'session-1' }))
      .resolves.toBe(true);
    await expect(index.wasUpdatedIn('spec/b.md', { scope: 'session', sessionId: 'session-1' }))
      .resolves.toBe(false);
  });

  it('detects spec updates between code refs by normalized commit time', async () => {
    runGit(['init'], codeRoot);
    runGit(['config', 'user.email', 'codex@example.com'], codeRoot);
    runGit(['config', 'user.name', 'Codex'], codeRoot);
    fs.writeFileSync(path.join(codeRoot, 'a.txt'), 'a\n');
    runGit(['add', 'a.txt'], codeRoot);
    runGit(['commit', '-m', 'base'], codeRoot, {
      GIT_AUTHOR_DATE: '2026-07-14T00:00:00+09:00',
      GIT_COMMITTER_DATE: '2026-07-14T00:00:00+09:00',
    });
    const fromRef = runGit(['rev-parse', 'HEAD'], codeRoot).trim();
    fs.writeFileSync(path.join(codeRoot, 'a.txt'), 'b\n');
    runGit(['add', 'a.txt'], codeRoot);
    runGit(['commit', '-m', 'head'], codeRoot, {
      GIT_AUTHOR_DATE: '2026-07-14T02:00:00+09:00',
      GIT_COMMITTER_DATE: '2026-07-14T02:00:00+09:00',
    });
    const toRef = runGit(['rev-parse', 'HEAD'], codeRoot).trim();

    db.prepare(`
      INSERT INTO session_commits(
        session_id, commit_hash, commit_message, author, committed_at,
        is_ai_assisted, files_changed, lines_added, lines_deleted, repo_id
      ) VALUES (?, ?, '', '', ?, 0, 0, 0, 0, ?)
    `).run('session-1', 'docs-commit-1', '2026-07-13T16:00:00.000Z', 9);
    db.prepare('INSERT INTO commit_files(commit_hash, file_path, repo_id) VALUES (?, ?, ?)')
      .run('docs-commit-1', 'spec/a.md', 9);

    const index = new SpecDocIndex({ db, docsRepoRoot: docsRoot, gitRepoRoot: codeRoot });

    await expect(index.wasUpdatedIn('spec/a.md', { scope: 'range', fromRef, toRef }))
      .resolves.toBe(true);
    await expect(index.wasUpdatedIn('spec/b.md', { scope: 'range', fromRef, toRef }))
      .resolves.toBe(false);
  });
});
