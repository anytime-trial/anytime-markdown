import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
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
  evaluateSessionStartGate,
  findClaudePid,
  isClaimLive,
  listLiveClaims,
  parseWorktreeRemoveTarget,
  readProcessStartTime,
  resolveAirspaceDir,
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

// isClaimLive は /proc/<pid>/comm === 'claude' を要求するため、実行ファイル名は必ず 'claude' にする。
// 複数プロセスを立てる場合は subdir を分ける（同じディレクトリに 2 つ目の 'claude' は作れない）。
function startClaudeNamedProcess(dir: string, subdir = 'bin'): ChildProcessWithoutNullStreams {
  const binDir = join(dir, subdir);
  mkdirSync(binDir, { recursive: true });
  const executable = join(binDir, 'claude');
  symlinkSync('/bin/sleep', executable);
  return spawn(executable, ['30']);
}

describe('レビュー指摘の回帰: worktree remove は削除対象と突合する', () => {
  const MY = '/repo/main';
  const VICTIM = '/repo/.worktrees/feature';

  function victimClaim(): AirspaceClaim {
    return claim({ sessionId: 'victim-1', worktree: VICTIM, branch: 'feature/x' });
  }

  it('parseWorktreeRemoveTarget は --force 付きの削除対象パスだけを返す', () => {
    expect(parseWorktreeRemoveTarget('git worktree remove --force ../wt')).toBe('../wt');
    expect(parseWorktreeRemoveTarget('git worktree remove -f ../wt')).toBe('../wt');
    // --force が無ければ git 自身が dirty な worktree の削除を拒否するのでゲート不要
    expect(parseWorktreeRemoveTarget('git worktree remove ../wt')).toBeNull();
    expect(parseWorktreeRemoveTarget('git worktree list')).toBeNull();
  });

  it('他 worktree で作業中のセッションを remove --force しようとすると deny', () => {
    // 自分は /repo/main にいる。従来は「自分の worktree に生存クレームがあるか」しか見ておらず、
    // 削除対象（別 worktree）のクレームと突合していなかったため素通りしていた。
    const verdict = evaluateBashGate(
      `git worktree remove --force ${VICTIM}`,
      [victimClaim()],
      MY,
      MY,
    );
    expect(verdict.kind).toBe('deny');
  });

  it('誰もいない worktree の remove --force は通す', () => {
    const verdict = evaluateBashGate('git worktree remove --force /repo/.worktrees/empty', [victimClaim()], MY, MY);
    expect(verdict).toEqual({ kind: 'pass' });
  });

  it('相対パス指定でも cwd 基準で解決して突合する', () => {
    const verdict = evaluateBashGate(
      'git worktree remove --force ../.worktrees/feature',
      [victimClaim()],
      MY,
      '/repo/main',
    );
    expect(verdict.kind).toBe('deny');
  });
});

describe('findClaudePid / evaluateSessionStartGate / resolveAirspaceDir', () => {
  let dir = '';
  let child: ChildProcessWithoutNullStreams | null = null;

  afterEach(() => {
    if (child !== null && child.pid !== undefined) child.kill('SIGKILL');
    child = null;
    if (dir !== '' && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it('findClaudePid は祖先を辿って claude プロセスを見つける', () => {
    // このテストプロセス（jest）の祖先に claude は居ない想定。存在しない pid からは null。
    expect(findClaudePid(999_999_999)).toBeNull();
  });

  it('findClaudePid は自分自身が claude なら自分を返す', () => {
    dir = tempDir();
    child = startClaudeNamedProcess(dir);
    const pid = child.pid ?? 0;
    expect(findClaudePid(pid)).toBe(pid);
  });

  it('evaluateSessionStartGate は同一 worktree の生存セッションを検出して advise', () => {
    const occupied = claim({ sessionId: 'other-1', worktree: '/repo', branch: 'feature/x' });
    expect(evaluateSessionStartGate([occupied], '/repo').kind).toBe('advise');
    // 別 worktree なら助言しない
    expect(evaluateSessionStartGate([occupied], '/other')).toEqual({ kind: 'pass' });
    // 単独なら助言しない
    expect(evaluateSessionStartGate([], '/repo')).toEqual({ kind: 'pass' });
  });

  it('resolveAirspaceDir は非 git ディレクトリで null を返す', () => {
    dir = tempDir();
    expect(resolveAirspaceDir(dir)).toBeNull();
  });
});

describe('同一プロセスの旧セッション（/clear 後）を他人と誤認しない', () => {
  let dir: string;
  let child: ChildProcessWithoutNullStreams | undefined;

  beforeEach(() => {
    dir = tempDir();
  });

  afterEach(() => {
    child?.kill('SIGKILL');
    rmSync(dir, { recursive: true, force: true });
  });

  it('writeClaim は同一 pid・別 sessionId のクレームを削除する', () => {
    child = startClaudeNamedProcess(dir);
    const pid = child.pid ?? 0;
    const starttime = readProcessStartTime(pid) ?? '';

    // /clear 前のセッション
    writeClaim(dir, claim({ sessionId: 'old-session', pid, starttime }));
    expect(existsSync(join(dir, 'claims', 'old-session.json'))).toBe(true);

    // /clear 後: 同じプロセスが新しい sessionId で走る
    writeClaim(dir, claim({ sessionId: 'new-session', pid, starttime }));

    expect(existsSync(join(dir, 'claims', 'old-session.json'))).toBe(false);
    expect(existsSync(join(dir, 'claims', 'new-session.json'))).toBe(true);
  });

  it('listLiveClaims は excludePid で自分自身のプロセスを除外する', () => {
    child = startClaudeNamedProcess(dir);
    const pid = child.pid ?? 0;
    const starttime = readProcessStartTime(pid) ?? '';

    writeClaim(dir, claim({ sessionId: 'stale-same-process', pid, starttime }));

    // sessionId だけで除外すると「生存している自分自身」を他人として拾ってしまう
    expect(listLiveClaims(dir, 'current-session')).toHaveLength(1);
    // pid でも除外すれば 0 件（＝単独作業ではゲートが発火しない）
    expect(listLiveClaims(dir, 'current-session', pid)).toHaveLength(0);
  });

  it('単独セッションでは破棄コマンドでもゲートが発火しない', () => {
    expect(evaluateBashGate('git reset --hard', [], '/repo')).toEqual({ kind: 'pass' });
  });
});

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
  let other: ChildProcessWithoutNullStreams | null = null;

  afterEach(() => {
    if (child !== null && child.pid !== undefined) child.kill();
    if (other !== null && other.pid !== undefined) other.kill();
    child = null;
    other = null;
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

    // 他セッションは別プロセスでなければならない。1 プロセスが 2 つの生存セッションを
    // 同時に持つことはなく（/clear は sessionId だけを変える）、同一 pid の旧クレームは
    // writeClaim が supersede して削除する。
    other = startClaudeNamedProcess(dir, 'bin-other');
    const otherPid = other.pid;
    if (otherPid === undefined) throw new Error('other pid is unavailable');
    const otherStart = readProcessStartTime(otherPid);
    if (otherStart === null) throw new Error('other starttime is unavailable');

    writeClaim(dir, claim({ sessionId: 'dead', pid: 999_999_999 }));
    writeFileSync(brokenPath, '{broken json');
    writeClaim(dir, claim({ sessionId: 'self', pid: childPid, starttime: childStart }));
    writeClaim(dir, claim({ sessionId: 'other', pid: otherPid, starttime: otherStart }));

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
