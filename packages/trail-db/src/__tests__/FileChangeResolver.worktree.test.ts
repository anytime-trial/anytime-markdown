import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { FileChangeResolver } from '../FileChangeResolver';

function runGit(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: 'pipe' });
}

describe('FileChangeResolver (worktree scope)', () => {
  let root: string;
  let db: Database.Database;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-worktree-resolver-'));
    db = new Database(':memory:');

    runGit(['init'], root);
    runGit(['config', 'user.email', 'dev@example.com'], root);
    runGit(['config', 'user.name', 'Dev'], root);

    fs.mkdirSync(path.join(root, 'packages', 'trail-core', 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'packages', 'trail-core', 'src', 'api.ts'),
      'export const alpha = 1;\n',
    );
    runGit(['add', '.'], root);
    runGit(['commit', '-m', 'feat: add api'], root);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  function resolveWorktree(): Promise<readonly { filePath: string }[]> {
    const resolver = new FileChangeResolver({ db, gitRepoRoot: root });
    return resolver.resolve({ scope: 'worktree' }) as Promise<readonly { filePath: string }[]>;
  }

  it('reports uncommitted modifications with diff stats and export-line counts', async () => {
    fs.writeFileSync(
      path.join(root, 'packages', 'trail-core', 'src', 'api.ts'),
      'export const alpha = 1;\nexport const beta = 2;\n',
    );

    const changed = await resolveWorktree();

    expect(changed).toEqual([
      {
        filePath: 'packages/trail-core/src/api.ts',
        linesAdded: 1,
        linesDeleted: 0,
        addedExportLines: 1,
        removedExportLines: 0,
      },
    ]);
  });

  it('includes untracked files, counting their whole content as added lines', async () => {
    fs.writeFileSync(
      path.join(root, 'packages', 'trail-core', 'src', 'newFeature.ts'),
      'export function added() {}\nconst helper = 1;\n',
    );

    const changed = await resolveWorktree();

    expect(changed).toEqual([
      {
        filePath: 'packages/trail-core/src/newFeature.ts',
        linesAdded: 2,
        linesDeleted: 0,
        addedExportLines: 1,
        removedExportLines: 0,
      },
    ]);
  });

  it('ignores files excluded by .gitignore', async () => {
    fs.writeFileSync(path.join(root, '.gitignore'), 'ignored.ts\n');
    runGit(['add', '.gitignore'], root);
    runGit(['commit', '-m', 'chore: add gitignore'], root);
    fs.writeFileSync(path.join(root, 'ignored.ts'), 'export const ignored = 1;\n');

    const changed = await resolveWorktree();

    expect(changed).toEqual([]);
  });

  it('returns an empty result when the working tree is clean', async () => {
    expect(await resolveWorktree()).toEqual([]);
  });

  it('does not touch the database (no repos row required)', async () => {
    fs.writeFileSync(path.join(root, 'packages', 'trail-core', 'src', 'api.ts'), 'export const a = 9;\n');

    await expect(resolveWorktree()).resolves.toHaveLength(1);
  });
});
