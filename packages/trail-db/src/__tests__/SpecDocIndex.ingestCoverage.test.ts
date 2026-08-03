/**
 * リグレッションテスト: docs リポジトリのコミット取込が欠落している状態を
 * 「設計書が更新されていない」と同一視しないこと。
 *
 * 背景: lep.json の gitRoots に docs リポジトリが含まれず CommitResolver が
 * 一度も走らなかった期間、session_commits / commit_files に docs の行が 1 件も
 * 無かった。旧実装はこれを false（= 呼び出し側で stale）と報告したため、
 * check_alignment が全件 stale を返し続けた。取込欠落は 'unknown' として
 * 区別する。
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { SpecDocIndex } from '../SpecDocIndex';

const DOCS_REPO_ID = 9;

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
    CREATE TABLE session_commit_resolutions(session_id TEXT, repo_id INTEGER, resolved_at TEXT);
  `);
  db.prepare('INSERT INTO repos(repo_id, repo_name) VALUES (?, ?)').run(DOCS_REPO_ID, 'anytime-markdown-docs');
  return db;
}

function insertDocsCommit(db: Database.Database, hash: string, committedAt: string, filePath?: string): void {
  db.prepare(`
    INSERT INTO session_commits(
      session_id, commit_hash, commit_message, author, committed_at,
      is_ai_assisted, files_changed, lines_added, lines_deleted, repo_id
    ) VALUES (?, ?, '', '', ?, 0, 0, 0, 0, ?)
  `).run('session-1', hash, committedAt, DOCS_REPO_ID);
  if (filePath) {
    db.prepare('INSERT INTO commit_files(commit_hash, file_path, repo_id) VALUES (?, ?, ?)')
      .run(hash, filePath, DOCS_REPO_ID);
  }
}

function markResolved(db: Database.Database, sessionId: string): void {
  db.prepare('INSERT INTO session_commit_resolutions(session_id, repo_id, resolved_at) VALUES (?, ?, ?)')
    .run(sessionId, DOCS_REPO_ID, '2026-07-14T00:00:00.000Z');
}

describe('SpecDocIndex.wasUpdatedIn — 取込カバレッジ', () => {
  let docsRoot: string;
  let codeRoot: string;
  let db: Database.Database;

  beforeEach(() => {
    docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-spec-coverage-docs-'));
    codeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-spec-coverage-code-'));
    db = createDb();
  });

  afterEach(() => {
    db.close();
    fs.rmSync(docsRoot, { recursive: true, force: true });
    fs.rmSync(codeRoot, { recursive: true, force: true });
  });

  describe('session スコープ', () => {
    it('そのセッションで docs の commit 解決が走っていなければ unknown を返す', async () => {
      const index = new SpecDocIndex({ db, docsRepoRoot: docsRoot, gitRepoRoot: codeRoot });

      await expect(index.wasUpdatedIn('spec/a.md', { scope: 'session', sessionId: 'session-1' }))
        .resolves.toBe('unknown');
    });

    it('解決済みで一致する commit_files が無ければ not-updated を返す', async () => {
      markResolved(db, 'session-1');
      insertDocsCommit(db, 'docs-1', '2026-07-14T00:00:00.000Z', 'spec/other.md');

      const index = new SpecDocIndex({ db, docsRepoRoot: docsRoot, gitRepoRoot: codeRoot });

      await expect(index.wasUpdatedIn('spec/a.md', { scope: 'session', sessionId: 'session-1' }))
        .resolves.toBe('not-updated');
    });

    it('解決済みで一致する commit_files があれば updated を返す', async () => {
      markResolved(db, 'session-1');
      insertDocsCommit(db, 'docs-1', '2026-07-14T00:00:00.000Z', 'spec/a.md');

      const index = new SpecDocIndex({ db, docsRepoRoot: docsRoot, gitRepoRoot: codeRoot });

      await expect(index.wasUpdatedIn('spec/a.md', { scope: 'session', sessionId: 'session-1' }))
        .resolves.toBe('updated');
    });
  });

  describe('range スコープ', () => {
    function initCodeRepo(): { fromRef: string; toRef: string } {
      runGit(['init'], codeRoot);
      runGit(['config', 'user.email', 'codex@example.com'], codeRoot);
      runGit(['config', 'user.name', 'Codex'], codeRoot);
      fs.writeFileSync(path.join(codeRoot, 'a.txt'), 'a\n');
      runGit(['add', 'a.txt'], codeRoot);
      runGit(['commit', '-m', 'base'], codeRoot, {
        GIT_AUTHOR_DATE: '2026-07-14T00:00:00+00:00',
        GIT_COMMITTER_DATE: '2026-07-14T00:00:00+00:00',
      });
      const fromRef = runGit(['rev-parse', 'HEAD'], codeRoot).trim();
      fs.writeFileSync(path.join(codeRoot, 'a.txt'), 'b\n');
      runGit(['add', 'a.txt'], codeRoot);
      runGit(['commit', '-m', 'head'], codeRoot, {
        GIT_AUTHOR_DATE: '2026-07-14T02:00:00+00:00',
        GIT_COMMITTER_DATE: '2026-07-14T02:00:00+00:00',
      });
      const toRef = runGit(['rev-parse', 'HEAD'], codeRoot).trim();
      return { fromRef, toRef };
    }

    it('docs の取込済みコミットが 1 件も無ければ unknown を返す', async () => {
      const { fromRef, toRef } = initCodeRepo();
      const index = new SpecDocIndex({ db, docsRepoRoot: docsRoot, gitRepoRoot: codeRoot });

      await expect(index.wasUpdatedIn('spec/a.md', { scope: 'range', fromRef, toRef }))
        .resolves.toBe('unknown');
    });

    it('取込済みコミットが範囲開始より前で止まっていれば unknown を返す', async () => {
      const { fromRef, toRef } = initCodeRepo();
      insertDocsCommit(db, 'docs-old', '2026-05-23T05:35:24.000Z', 'spec/other.md');

      const index = new SpecDocIndex({ db, docsRepoRoot: docsRoot, gitRepoRoot: codeRoot });

      await expect(index.wasUpdatedIn('spec/a.md', { scope: 'range', fromRef, toRef }))
        .resolves.toBe('unknown');
    });

    it('取込が範囲を跨いでいれば not-updated / updated を区別する', async () => {
      const { fromRef, toRef } = initCodeRepo();
      insertDocsCommit(db, 'docs-in-range', '2026-07-14T01:00:00.000Z', 'spec/a.md');

      const index = new SpecDocIndex({ db, docsRepoRoot: docsRoot, gitRepoRoot: codeRoot });

      await expect(index.wasUpdatedIn('spec/a.md', { scope: 'range', fromRef, toRef }))
        .resolves.toBe('updated');
      await expect(index.wasUpdatedIn('spec/b.md', { scope: 'range', fromRef, toRef }))
        .resolves.toBe('not-updated');
    });
  });

  describe('worktree スコープ', () => {
    it('DB を使わないため取込欠落でも unknown にならない', async () => {
      runGit(['init'], docsRoot);
      runGit(['config', 'user.email', 'codex@example.com'], docsRoot);
      runGit(['config', 'user.name', 'Codex'], docsRoot);
      fs.mkdirSync(path.join(docsRoot, 'spec'), { recursive: true });
      fs.writeFileSync(path.join(docsRoot, 'spec', 'a.md'), '# A\n');

      const index = new SpecDocIndex({ db, docsRepoRoot: docsRoot, gitRepoRoot: codeRoot });

      await expect(index.wasUpdatedIn('spec/a.md', { scope: 'worktree' }))
        .resolves.toBe('updated');
      await expect(index.wasUpdatedIn('spec/b.md', { scope: 'worktree' }))
        .resolves.toBe('not-updated');
    });
  });
});
