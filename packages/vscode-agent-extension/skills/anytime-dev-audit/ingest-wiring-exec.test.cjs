const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resolveExecutable, runCommand, gitWorkTreeProbe } = require('./ingest-wiring-exec.cjs');

describe('resolveExecutable', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-resolve-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const writeExecutable = (name) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(file, 0o755);
    return file;
  };

  it('PATH の絶対パス要素から実行ファイルを絶対パスで返す', () => {
    const file = writeExecutable('mytool');
    expect(resolveExecutable('mytool', { PATH: dir })).toBe(file);
  });

  it('PATH の相対要素・空要素は走査しない（cwd を探索させない）', () => {
    writeExecutable('mytool');
    // '.' や '' は cwd を指すため、そこに置かれた実行ファイルを拾ってはならない。
    expect(resolveExecutable('mytool', { PATH: ['', '.', 'relative/dir'].join(path.delimiter) })).toBeNull();
  });

  it('実行権の無いファイルは候補にしない', () => {
    const file = path.join(dir, 'noexec');
    fs.writeFileSync(file, 'x');
    fs.chmodSync(file, 0o644);
    expect(resolveExecutable('noexec', { PATH: dir })).toBeNull();
  });

  it('解決できなければ null（コマンド名へフォールバックしない）', () => {
    expect(resolveExecutable('definitely-not-a-real-tool', { PATH: dir })).toBeNull();
  });

  it('git は ANYTIME_GIT_PATH（絶対パス）で差し替えられる', () => {
    expect(resolveExecutable('git', { PATH: dir, ANYTIME_GIT_PATH: '/opt/git/bin/git' })).toBe('/opt/git/bin/git');
  });

  it('ANYTIME_GIT_PATH が相対パスなら無視する', () => {
    expect(resolveExecutable('git', { PATH: dir, ANYTIME_GIT_PATH: './git' })).toBeNull();
  });

  it('git 以外には ANYTIME_GIT_PATH を適用しない', () => {
    expect(resolveExecutable('sqlite3', { PATH: dir, ANYTIME_GIT_PATH: '/opt/git/bin/git' })).toBeNull();
  });
});

describe('runCommand', () => {
  it('実行ファイルを解決できなければ kind: not-found（exit と区別する）', () => {
    const r = runCommand('definitely-not-a-real-tool', [], { PATH: '/nonexistent-dir' });
    expect(r).toMatchObject({ ok: false, kind: 'not-found' });
    expect(r.message).toContain('解決できない');
  });

  it('成功時は stdout を trim して返す', () => {
    const r = runCommand('git', ['--version']);
    expect(r.ok).toBe(true);
    expect(r.stdout).toMatch(/^git version/);
  });

  it('非ゼロ終了は kind: exit', () => {
    const r = runCommand('git', ['-C', '/nonexistent-dir-xyz', 'rev-parse', '--is-inside-work-tree']);
    expect(r).toMatchObject({ ok: false, kind: 'exit' });
  });
});

describe('gitWorkTreeProbe', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-probe-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('git リポジトリなら true', () => {
    runCommand('git', ['-C', dir, 'init', '-q']);
    expect(gitWorkTreeProbe(dir)).toBe(true);
  });

  it('git リポジトリでなければ false（明確な否定）', () => {
    expect(gitWorkTreeProbe(dir)).toBe(false);
  });

  it('「not a git repository」だけを確定的な否定として扱う', () => {
    const run = () => ({ ok: false, kind: 'exit', message: "fatal: not a git repository (or any of the parent directories): .git" });
    expect(gitWorkTreeProbe('/x', run)).toBe(false);
  });

  it('Permission denied など未列挙の失敗は false と断定せず unknown にする', () => {
    // 列挙すべきは「測定不能にする理由」ではなく「断定してよい理由」。
    const run = () => ({ ok: false, kind: 'exit', message: "fatal: cannot change to '/x': Permission denied" });
    const result = gitWorkTreeProbe('/x', run);
    expect(result.unknown).toContain('Permission denied');
  });

  it('dubious ownership は safe.directory を疑うよう理由を分ける', () => {
    const run = () => ({ ok: false, kind: 'exit', message: "fatal: detected dubious ownership in repository at '/x'" });
    expect(gitWorkTreeProbe('/x', run).unknown).toContain('safe.directory');
  });

  it('git を解決できない環境では false ではなく unknown を返す', () => {
    const saved = process.env.PATH;
    process.env.PATH = '/nonexistent-dir';
    try {
      const result = gitWorkTreeProbe(dir);
      expect(typeof result).toBe('object');
      expect(result.unknown).toContain('git 実行ファイル');
    } finally {
      process.env.PATH = saved;
    }
  });
});
