import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  FileChangeResolver,
  countExportLinesByFile,
  parseNumstat,
} from '../FileChangeResolver';

function runGit(args: string[], cwd: string, env?: NodeJS.ProcessEnv): string {
  return execFileSync('git', args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf-8',
    stdio: 'pipe',
  });
}

describe('parseNumstat', () => {
  it('parses multiple files and treats binary stats as zero', () => {
    expect(parseNumstat('10\t2\tsrc/a.ts\n-\t-\tassets/logo.png\n3\t0\tsrc/b.ts\n')).toEqual([
      { filePath: 'src/a.ts', linesAdded: 10, linesDeleted: 2 },
      { filePath: 'assets/logo.png', linesAdded: 0, linesDeleted: 0 },
      { filePath: 'src/b.ts', linesAdded: 3, linesDeleted: 0 },
    ]);
  });
});

describe('countExportLinesByFile', () => {
  it('counts added and removed export lines by current patch file', () => {
    const patch = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,2 +1,2 @@',
      '-export const oldValue = 1;',
      '+export const newValue = 2;',
      '+const notExport = 3;',
      'diff --git a/src/b.ts b/src/b.ts',
      '--- a/src/b.ts',
      '+++ b/src/b.ts',
      '@@ -1 +1 @@',
      '-export function oldFn() {}',
      '+export function newFn() {}',
    ].join('\n');

    expect([...countExportLinesByFile(patch).entries()]).toEqual([
      ['src/a.ts', { added: 1, removed: 1 }],
      ['src/b.ts', { added: 1, removed: 1 }],
    ]);
  });
});

describe('FileChangeResolver', () => {
  let root: string;
  let db: Database.Database;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-file-change-resolver-'));
    db = new Database(':memory:');
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
    `);
    db.prepare('INSERT INTO repos(repo_id, repo_name) VALUES (?, ?)').run(1, 'anytime-markdown');

    runGit(['init'], root);
    runGit(['config', 'user.email', 'codex@example.com'], root);
    runGit(['config', 'user.name', 'Codex'], root);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('resolves session commits and aggregates file stats with export-line counts', async () => {
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'api.ts'), 'export const alpha = 1;\n');
    runGit(['add', 'src/api.ts'], root);
    runGit(['commit', '-m', 'feat: add api'], root);
    const firstHash = runGit(['rev-parse', 'HEAD'], root).trim();

    fs.writeFileSync(path.join(root, 'src', 'api.ts'), 'export const beta = 2;\nexport const gamma = 3;\n');
    runGit(['add', 'src/api.ts'], root);
    runGit(['commit', '-m', 'feat: update api'], root);
    const secondHash = runGit(['rev-parse', 'HEAD'], root).trim();

    const insertCommit = db.prepare(`
      INSERT INTO session_commits(
        session_id, commit_hash, commit_message, author, committed_at,
        is_ai_assisted, files_changed, lines_added, lines_deleted, repo_id
      ) VALUES (?, ?, '', '', '', 0, 0, 0, 0, ?)
    `);
    insertCommit.run('session-1', firstHash, 1);
    insertCommit.run('session-1', secondHash, 1);

    const resolver = new FileChangeResolver({ db, gitRepoRoot: root });
    await expect(resolver.resolve({ scope: 'session', sessionId: 'session-1' })).resolves.toEqual([
      {
        filePath: 'src/api.ts',
        linesAdded: 3,
        linesDeleted: 1,
        addedExportLines: 3,
        removedExportLines: 1,
      },
    ]);
  });
});
