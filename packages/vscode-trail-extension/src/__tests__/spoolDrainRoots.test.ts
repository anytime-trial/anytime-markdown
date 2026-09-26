import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetSpoolDrainRootWarnings, resolveSpoolDrainDirs } from '../emergency/spoolDrainRoots';

describe('resolveSpoolDrainDirs', () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'spool-drain-roots-'));
    execFileSync('git', ['init', '-q'], { cwd: repo });
    resetSpoolDrainRootWarnings();
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('skips empty and unresolvable candidates and keeps the resolvable ones', () => {
    const warnings: string[] = [];
    const dirs = resolveSpoolDrainDirs(['', undefined, '/nonexistent/x', repo], (m) => warnings.push(m));
    expect(dirs).toEqual([join(repo, '.git', 'anytime')]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('/nonexistent/x');
  });

  it('warns about an unresolvable path only once across cycles (60s interval must not spam)', () => {
    const warnings: string[] = [];
    resolveSpoolDrainDirs(['/nonexistent/x'], (m) => warnings.push(m));
    resolveSpoolDrainDirs(['/nonexistent/x'], (m) => warnings.push(m));
    expect(warnings).toHaveLength(1);
  });

  it('dedupes roots sharing one git-common-dir (main checkout + worktree)', () => {
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-q', '-m', 'init'], { cwd: repo });
    const wt = join(repo, '.wt');
    execFileSync('git', ['worktree', 'add', '-q', wt, '-b', 'wt'], { cwd: repo });
    const dirs = resolveSpoolDrainDirs([repo, wt, repo]);
    expect(dirs).toHaveLength(1);
  });
});
