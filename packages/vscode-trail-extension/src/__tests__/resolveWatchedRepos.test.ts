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

const writeHistoryJson = (workspaceFolder: string, body: unknown): void => {
  const anytimeDir = path.join(workspaceFolder, '.anytime');
  fs.mkdirSync(anytimeDir, { recursive: true });
  fs.writeFileSync(path.join(anytimeDir, 'anytime-history.json'), JSON.stringify(body));
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

  it('case 1: workspace.path のみ + anytime-history.json 不在 → 1 件返す', () => {
    const wsRepo = path.join(tmpRoot, 'ws');
    initGitRepo(wsRepo);

    const result = resolveWatchedRepos({
      workspacePath: wsRepo,
      workspaceFolder: wsRepo,
      logger,
    });

    expect(result).toEqual([{ gitRoot: wsRepo, repoName: 'ws' }]);
  });

  it('case 2: workspace.path + specDocsRoots 2 件 → 3 件返す（重複なし）', () => {
    const ws = path.join(tmpRoot, 'ws-a');
    const docs = path.join(tmpRoot, 'docs-a');
    const skills = path.join(tmpRoot, 'skills-a');
    initGitRepo(ws);
    initGitRepo(docs);
    initGitRepo(skills);
    writeHistoryJson(ws, { specDocsRoots: [docs, skills] });

    const result = resolveWatchedRepos({
      workspacePath: ws,
      workspaceFolder: ws,
      logger,
    });

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.repoName).sort()).toEqual(['docs-a', 'skills-a', 'ws-a']);
  });

  it('case 3: specDocsRoots に workspace.path と同一パス → 1 件に集約', () => {
    const ws = path.join(tmpRoot, 'ws-b');
    initGitRepo(ws);
    writeHistoryJson(ws, { specDocsRoots: [ws] });

    const result = resolveWatchedRepos({
      workspacePath: ws,
      workspaceFolder: ws,
      logger,
    });

    expect(result).toHaveLength(1);
    expect(result[0].gitRoot).toBe(ws);
  });

  it('case 4: specDocsRoots に重複パス → 1 件に集約', () => {
    const ws = path.join(tmpRoot, 'ws-c');
    const docs = path.join(tmpRoot, 'docs-c');
    initGitRepo(ws);
    initGitRepo(docs);
    writeHistoryJson(ws, { specDocsRoots: [docs, docs] });

    const result = resolveWatchedRepos({
      workspacePath: ws,
      workspaceFolder: ws,
      logger,
    });

    expect(result).toHaveLength(2);
  });

  it('case 5: specDocsRoots に存在しないパス・git でないパス → warn 後にスキップ、有効分のみ返る', () => {
    const ws = path.join(tmpRoot, 'ws-d');
    const validRepo = path.join(tmpRoot, 'valid-d');
    const nonExistent = path.join(tmpRoot, 'nope-d');
    const notGitDir = path.join(tmpRoot, 'plain-d');
    initGitRepo(ws);
    initGitRepo(validRepo);
    fs.mkdirSync(notGitDir, { recursive: true });
    writeHistoryJson(ws, { specDocsRoots: [validRepo, nonExistent, notGitDir] });

    const result = resolveWatchedRepos({
      workspacePath: ws,
      workspaceFolder: ws,
      logger,
    });

    expect(result.map((r) => r.repoName).sort()).toEqual(['valid-d', 'ws-d']);
    expect(warnLog.some((m) => m.includes('does not exist') && m.includes('nope-d'))).toBe(true);
    expect(warnLog.some((m) => m.includes('not a git working tree') && m.includes('plain-d'))).toBe(true);
  });

  it('case 6: anytime-history.json が JSON 破損 → warn 出力し workspace.path のみで続行', () => {
    const ws = path.join(tmpRoot, 'ws-e');
    initGitRepo(ws);
    fs.mkdirSync(path.join(ws, '.anytime'), { recursive: true });
    fs.writeFileSync(path.join(ws, '.anytime', 'anytime-history.json'), '{ broken json');

    const result = resolveWatchedRepos({
      workspacePath: ws,
      workspaceFolder: ws,
      logger,
    });

    expect(result).toHaveLength(1);
    expect(result[0].repoName).toBe('ws-e');
    expect(warnLog.some((m) => m.includes('failed to parse'))).toBe(true);
  });

  it('case 7: specDocsRoots フィールド欠落 → workspace.path のみ', () => {
    const ws = path.join(tmpRoot, 'ws-f');
    initGitRepo(ws);
    writeHistoryJson(ws, { mdOnly: true });

    const result = resolveWatchedRepos({
      workspacePath: ws,
      workspaceFolder: ws,
      logger,
    });

    expect(result).toHaveLength(1);
    expect(result[0].repoName).toBe('ws-f');
  });
});
