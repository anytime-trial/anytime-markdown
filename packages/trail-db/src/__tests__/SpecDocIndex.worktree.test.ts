import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { SpecDocIndex } from '../SpecDocIndex';

function runGit(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: 'pipe' });
}

function writeSpec(docsRoot: string, relativePath: string, c4Scope: string): void {
  const fullPath = path.join(docsRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, ['---', 'title: "S"', `c4Scope: [${c4Scope}]`, '---', '# S', ''].join('\n'));
}

describe('SpecDocIndex.wasUpdatedIn (worktree scope)', () => {
  let docsRoot: string;
  let codeRoot: string;
  let db: Database.Database;
  let index: SpecDocIndex;

  beforeEach(() => {
    docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-worktree-docs-'));
    codeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-worktree-code-'));
    db = new Database(':memory:');

    runGit(['init'], docsRoot);
    runGit(['config', 'user.email', 'dev@example.com'], docsRoot);
    runGit(['config', 'user.name', 'Dev'], docsRoot);
    writeSpec(docsRoot, 'spec/31.trail/trail-core.ja.md', '"pkg_trail-core"');
    runGit(['add', '.'], docsRoot);
    runGit(['commit', '-m', 'docs: add spec'], docsRoot);

    index = new SpecDocIndex({ db, docsRepoRoot: docsRoot, gitRepoRoot: codeRoot });
  });

  afterEach(() => {
    db.close();
    fs.rmSync(docsRoot, { recursive: true, force: true });
    fs.rmSync(codeRoot, { recursive: true, force: true });
  });

  it('reports false when the spec document is unchanged in the docs working tree', async () => {
    await expect(
      index.wasUpdatedIn('spec/31.trail/trail-core.ja.md', { scope: 'worktree' }),
    ).resolves.toBe(false);
  });

  it('reports true when the spec document has uncommitted modifications', async () => {
    fs.appendFileSync(path.join(docsRoot, 'spec/31.trail/trail-core.ja.md'), '\n追記\n');

    await expect(
      index.wasUpdatedIn('spec/31.trail/trail-core.ja.md', { scope: 'worktree' }),
    ).resolves.toBe(true);
  });

  it('reports true for a brand-new untracked spec document', async () => {
    writeSpec(docsRoot, 'spec/31.trail/new-spec.ja.md', '"pkg_trail-db"');

    await expect(
      index.wasUpdatedIn('spec/31.trail/new-spec.ja.md', { scope: 'worktree' }),
    ).resolves.toBe(true);
  });

  it('matches spec documents whose paths git records in quoted form', async () => {
    const japanesePath = 'spec/31.trail/設計書.ja.md';
    writeSpec(docsRoot, japanesePath, '"pkg_trail-core"');

    await expect(index.wasUpdatedIn(japanesePath, { scope: 'worktree' })).resolves.toBe(true);
  });

  it('does not require the docs repository to exist in the repos table', async () => {
    fs.appendFileSync(path.join(docsRoot, 'spec/31.trail/trail-core.ja.md'), '\n追記\n');

    await expect(
      index.wasUpdatedIn('spec/31.trail/trail-core.ja.md', { scope: 'worktree' }),
    ).resolves.toBe(true);
  });
});
