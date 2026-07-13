import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import {
  AirspaceClaim,
  classifyGitCommand,
  evaluateBashGate,
  evaluateEditGate,
  isClaimLive,
  listLiveClaims,
  readProcessStartTime,
  writeClaim,
} from '../airspace';

function tempDir(): string {
  return mkdtempSync('/tmp/anytime-airspace-');
}

function claim(overrides: Partial<AirspaceClaim> = {}): AirspaceClaim {
  return {
    sessionId: 'session-a',
    pid: 999_999_999,
    starttime: '1',
    worktree: '/repo',
    branch: 'develop',
    file: '',
    updatedAt: '2026-07-13T05:32:11.123Z',
    ...overrides,
  };
}

function startClaudeNamedProcess(dir: string): ChildProcessWithoutNullStreams {
  const executable = join(dir, 'claude');
  symlinkSync('/bin/sleep', executable);
  return spawn(executable, ['30']);
}

describe('classifyGitCommand — レビューで見つかった誤分類の回帰', () => {
  // `--` なしのパス指定は未コミット変更を破棄する。ブランチ指定と文字列では区別できないため、
  // 作業ツリー上に実在するかで判定する（実在判定が無ければブランチ扱い＝従来動作）。
  it('treats `git checkout <existing path>` as discard, not branch-change', () => {
    const ctx = { fileExists: (p: string) => p === 'src/a.ts' };
    expect(classifyGitCommand('git checkout src/a.ts', ctx)).toBe('discard');
    expect(classifyGitCommand('git checkout feature/x', ctx)).toBe('branch-change');
    // 実在判定を渡さなければブランチ扱い（過剰 deny を避ける）
    expect(classifyGitCommand('git checkout src/a.ts')).toBe('branch-change');
  });

  it('does not mistake a pathspec containing "f" for git clean --force', () => {
    expect(classifyGitCommand('git clean foo/')).toBe('none');
    expect(classifyGitCommand('git clean -f foo/')).toBe('discard');
  });

  it('classifies stash clear/drop as discard (退避済みの作業を消すため)', () => {
    expect(classifyGitCommand('git stash clear')).toBe('discard');
    expect(classifyGitCommand('git stash drop')).toBe('discard');
    expect(classifyGitCommand('git stash apply')).toBe('none');
    expect(classifyGitCommand('git stash pop')).toBe('none');
  });
});

describe('classifyGitCommand', () => {
  it('classifies discard commands', () => {
    expect(classifyGitCommand('git reset --hard HEAD~1')).toBe('discard');
    expect(classifyGitCommand('git clean -fd')).toBe('discard');
    expect(classifyGitCommand('git clean -n')).toBe('none');
    expect(classifyGitCommand('git stash')).toBe('discard');
    expect(classifyGitCommand('git stash list')).toBe('none');
    expect(classifyGitCommand('git stash pop')).toBe('none');
    expect(classifyGitCommand('git restore src/a.ts')).toBe('discard');
    expect(classifyGitCommand('git restore --staged src/a.ts')).toBe('none');
    expect(classifyGitCommand('git checkout -- src/a.ts')).toBe('discard');
    expect(classifyGitCommand('git branch -D feature/x')).toBe('discard');
    expect(classifyGitCommand('git worktree remove --force ../wt')).toBe('discard');
  });

  it('classifies branch changes and safe commands', () => {
    expect(classifyGitCommand('git switch develop')).toBe('branch-change');
    expect(classifyGitCommand('git checkout -b feat')).toBe('branch-change');
    expect(classifyGitCommand('git status')).toBe('none');
    expect(classifyGitCommand('npm test')).toBe('none');
    expect(classifyGitCommand('git log')).toBe('none');
  });
});

describe('process liveness', () => {
  it('treats a missing pid as dead', () => {
    expect(isClaimLive(claim())).toBe(false);
  });

  it('detects starttime mismatch for an existing pid', () => {
    const starttime = readProcessStartTime(process.pid);
    expect(starttime).not.toBeNull();
    expect(isClaimLive(claim({ pid: process.pid, starttime: `${starttime}-mismatch` }))).toBe(false);
  });
});

describe('listLiveClaims', () => {
  let dir = '';
  let child: ChildProcessWithoutNullStreams | null = null;

  afterEach(() => {
    if (child !== null && child.pid !== undefined) child.kill();
    child = null;
    if (dir !== '' && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it('removes dead and broken claims while returning other valid claims except self', () => {
    dir = tempDir();
    child = startClaudeNamedProcess(dir);
    const childPid = child.pid;
    expect(childPid).not.toBeUndefined();
    if (childPid === undefined) throw new Error('child pid is unavailable');
    const childStart = readProcessStartTime(childPid);
    expect(childStart).not.toBeNull();
    if (childStart === null) throw new Error('child starttime is unavailable');

    const claimsDir = join(dir, 'claims');
    const deadPath = join(claimsDir, 'dead.json');
    const brokenPath = join(claimsDir, 'broken.json');
    const selfPath = join(claimsDir, 'self.json');
    const otherPath = join(claimsDir, 'other.json');

    writeClaim(dir, claim({ sessionId: 'dead', pid: 999_999_999 }));
    writeFileSync(brokenPath, '{broken json');
    writeClaim(dir, claim({ sessionId: 'self', pid: childPid, starttime: childStart }));
    writeClaim(dir, claim({ sessionId: 'other', pid: childPid, starttime: childStart }));

    const live = listLiveClaims(dir, 'self');

    expect(live.map((item) => item.sessionId)).toEqual(['other']);
    expect(existsSync(deadPath)).toBe(false);
    expect(existsSync(brokenPath)).toBe(false);
    expect(existsSync(selfPath)).toBe(true);
    expect(existsSync(otherPath)).toBe(true);
  });
});

describe('gate evaluation', () => {
  const other = claim({ sessionId: 'abcdef123456', worktree: '/repo', branch: 'feature/x' });

  it('does not fire for a single session or a different worktree', () => {
    expect(evaluateBashGate('git reset --hard', [], '/repo')).toEqual({ kind: 'pass' });
    expect(evaluateBashGate('git reset --hard', [claim({ worktree: '/other' })], '/repo')).toEqual({
      kind: 'pass',
    });
  });

  it('denies discard commands in the same worktree', () => {
    const verdict = evaluateBashGate('git reset --hard', [other], '/repo');
    expect(verdict.kind).toBe('deny');
    expect('reason' in verdict ? verdict.reason : '').toContain('abcdef12');
    expect('reason' in verdict ? verdict.reason : '').toContain('feature/x');
  });

  it('warns on branch changes in the same worktree', () => {
    expect(evaluateBashGate('git switch develop', [other], '/repo').kind).toBe('warn');
  });

  it('warns only when editing the same file', () => {
    expect(evaluateEditGate('/repo/src/a.ts', [claim({ file: '/repo/src/a.ts' })]).kind).toBe('warn');
    expect(evaluateEditGate('/repo/src/b.ts', [claim({ file: '/repo/src/a.ts' })])).toEqual({
      kind: 'pass',
    });
  });
});

describe('writeClaim', () => {
  let dir = '';

  afterEach(() => {
    if (dir !== '' && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it('writes atomically without leaving temporary files and overwrites existing claims', () => {
    dir = tempDir();
    writeClaim(dir, claim({ sessionId: 'session-a', file: 'first.ts' }));
    writeClaim(dir, claim({ sessionId: 'session-a', file: 'second.ts' }));

    const claimsDir = join(dir, 'claims');
    const files = readdirSync(claimsDir);
    expect(files).toEqual(['session-a.json']);

    const raw: unknown = JSON.parse(readFileSync(join(claimsDir, 'session-a.json'), 'utf8'));
    expect(typeof raw).toBe('object');
    expect(raw).toMatchObject({ sessionId: 'session-a', file: 'second.ts' });
  });
});
