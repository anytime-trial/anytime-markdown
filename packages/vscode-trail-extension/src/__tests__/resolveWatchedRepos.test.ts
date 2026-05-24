import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { resolveWatchedRepos } from '../utils/resolveWatchedRepos';

const initGitRepo = (dir: string): void => {
  fs.mkdirSync(dir, { recursive: true });
  const opts = { cwd: dir, encoding: 'utf-8' as const };
  execFileSync('git', ['init', '-q', '-b', 'main'], opts);
  execFileSync('git', ['config', 'user.email', 'test@example.com'], opts);
  execFileSync('git', ['config', 'user.name', 'Test'], opts);
};

describe('resolveWatchedRepos', () => {
  let tmpRoot: string;
  let warnLog: string[];
  const logger = { warn: (msg: string) => { warnLog.push(msg); } };

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-watched-repos-'));
    warnLog = [];
  });

  afterEach(() => {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('case 1: gitRoots 空 + workspacePath のみ → 1 件返す', () => {
    const ws = path.join(tmpRoot, 'ws');
    initGitRepo(ws);

    const result = resolveWatchedRepos({
      gitRoots: [],
      workspacePath: ws,
      logger,
    });

    expect(result).toEqual([{ gitRoot: ws, repoName: 'ws' }]);
  });

  it('case 2: gitRoots 2 件 + workspacePath（別パス）→ 3 件返す（gitRoots 先頭順）', () => {
    const ws = path.join(tmpRoot, 'ws-a');
    const docs = path.join(tmpRoot, 'docs-a');
    const skills = path.join(tmpRoot, 'skills-a');
    initGitRepo(ws);
    initGitRepo(docs);
    initGitRepo(skills);

    const result = resolveWatchedRepos({
      gitRoots: [docs, skills],
      workspacePath: ws,
      logger,
    });

    expect(result).toHaveLength(3);
    // gitRoots を先頭に積むため docs → skills → ws の順
    expect(result.map((r) => r.repoName)).toEqual(['docs-a', 'skills-a', 'ws-a']);
  });

  it('case 3: workspacePath が gitRoots と同一パス → 1 件に集約（gitRoots 側を維持）', () => {
    const ws = path.join(tmpRoot, 'ws-b');
    initGitRepo(ws);

    const result = resolveWatchedRepos({
      gitRoots: [ws],
      workspacePath: ws,
      logger,
    });

    expect(result).toHaveLength(1);
    expect(result[0].gitRoot).toBe(ws);
  });

  it('case 4: gitRoots 内に重複パス → 1 件に集約', () => {
    const ws = path.join(tmpRoot, 'ws-c');
    const docs = path.join(tmpRoot, 'docs-c');
    initGitRepo(ws);
    initGitRepo(docs);

    const result = resolveWatchedRepos({
      gitRoots: [docs, docs],
      workspacePath: ws,
      logger,
    });

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.repoName)).toEqual(['docs-c', 'ws-c']);
  });

  it('case 5: gitRoots に存在しないパス・git でないパス → warn 後スキップ、有効分のみ返る', () => {
    const ws = path.join(tmpRoot, 'ws-d');
    const validRepo = path.join(tmpRoot, 'valid-d');
    const nonExistent = path.join(tmpRoot, 'nope-d');
    const notGitDir = path.join(tmpRoot, 'plain-d');
    initGitRepo(ws);
    initGitRepo(validRepo);
    fs.mkdirSync(notGitDir, { recursive: true });

    const result = resolveWatchedRepos({
      gitRoots: [validRepo, nonExistent, notGitDir],
      workspacePath: ws,
      logger,
    });

    expect(result.map((r) => r.repoName).sort()).toEqual(['valid-d', 'ws-d']);
    expect(warnLog.some((m) => m.includes('does not exist') && m.includes('nope-d'))).toBe(true);
    expect(warnLog.some((m) => m.includes('not a git working tree') && m.includes('plain-d'))).toBe(true);
  });

  it('case 6: workspacePath undefined + gitRoots のみ（デーモン相当）→ gitRoots を返す', () => {
    const docs = path.join(tmpRoot, 'docs-e');
    const skills = path.join(tmpRoot, 'skills-e');
    initGitRepo(docs);
    initGitRepo(skills);

    const result = resolveWatchedRepos({
      gitRoots: [docs, skills],
      logger,
    });

    expect(result.map((r) => r.repoName)).toEqual(['docs-e', 'skills-e']);
  });

  it('case 7: 空文字エントリは無視する', () => {
    const ws = path.join(tmpRoot, 'ws-f');
    const docs = path.join(tmpRoot, 'docs-f');
    initGitRepo(ws);
    initGitRepo(docs);

    const result = resolveWatchedRepos({
      gitRoots: [docs, '', '   '],
      workspacePath: '',
      logger,
    });

    expect(result.map((r) => r.repoName)).toEqual(['docs-f']);
  });
});
