import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  findGitExecutable,
  resolveGitExecutable,
  resetGitExecutableCacheForTest,
  GitExecutableNotFoundError,
  GIT_PATH_ENV,
} from '../gitExecutable';

/** 与えた集合だけを実行可能ファイルとみなす差し替え。 */
function executableSet(paths: readonly string[]): (candidate: string) => boolean {
  const set = new Set(paths);
  return (candidate) => set.has(candidate);
}

describe('findGitExecutable', () => {
  describe('posix', () => {
    const posix = {
      platform: 'linux' as NodeJS.Platform,
      pathValue: '/usr/local/bin:/usr/bin:/bin',
    };

    it('PATH の並び順で最初に見つかった絶対パスを返す', () => {
      expect(
        findGitExecutable({
          ...posix,
          isExecutableFile: executableSet(['/usr/bin/git', '/bin/git']),
        }),
      ).toBe('/usr/bin/git');
    });

    it('どのディレクトリにも無ければ null を返す', () => {
      expect(
        findGitExecutable({ ...posix, isExecutableFile: executableSet([]) }),
      ).toBeNull();
    });

    it('PATH の空エントリ（= カレントディレクトリ）を候補にしない', () => {
      // ':/usr/bin' の先頭空要素は POSIX では cwd を意味する。
      // 信頼できないリポジトリ直下の git を拾わないことが本関数の要件。
      expect(
        findGitExecutable({
          platform: 'linux',
          pathValue: ':/usr/bin',
          isExecutableFile: executableSet(['git', './git', '/usr/bin/git']),
        }),
      ).toBe('/usr/bin/git');
    });

    it('PATH の相対エントリを候補にしない', () => {
      expect(
        findGitExecutable({
          platform: 'linux',
          pathValue: '.:node_modules/.bin',
          isExecutableFile: () => true,
        }),
      ).toBeNull();
    });

    it('PATH が空なら null を返す', () => {
      expect(
        findGitExecutable({ platform: 'linux', pathValue: '', isExecutableFile: () => true }),
      ).toBeNull();
    });

    it('Windows 用の拡張子を付けない', () => {
      expect(
        findGitExecutable({
          ...posix,
          isExecutableFile: executableSet(['/usr/bin/git.exe']),
        }),
      ).toBeNull();
    });
  });

  describe('win32', () => {
    const win32 = {
      platform: 'win32' as NodeJS.Platform,
      pathValue: 'C:\\Windows\\system32;C:\\Program Files\\Git\\cmd',
    };

    it('.COM → .EXE の順に試す', () => {
      expect(
        findGitExecutable({
          ...win32,
          isExecutableFile: executableSet([
            'C:\\Program Files\\Git\\cmd\\git.COM',
            'C:\\Program Files\\Git\\cmd\\git.EXE',
          ]),
        }),
      ).toBe('C:\\Program Files\\Git\\cmd\\git.COM');
    });

    it('バッチファイル（.CMD / .BAT）を候補にしない', () => {
      // Node は shell なしでバッチを起動できない。拾うと「見つかったのに実行できない」になる。
      expect(
        findGitExecutable({
          ...win32,
          isExecutableFile: executableSet([
            'C:\\Program Files\\Git\\cmd\\git.CMD',
            'C:\\Program Files\\Git\\cmd\\git.BAT',
          ]),
        }),
      ).toBeNull();
    });

    it('引用符付きの PATH エントリを剥がして解決する', () => {
      expect(
        findGitExecutable({
          platform: 'win32',
          pathValue: '"C:\\Program Files\\Git\\cmd"',
          isExecutableFile: executableSet(['C:\\Program Files\\Git\\cmd\\git.EXE']),
        }),
      ).toBe('C:\\Program Files\\Git\\cmd\\git.EXE');
    });

    it('相対エントリ（cwd 相対）を候補にしない', () => {
      // CreateProcess は cwd を PATH より先に探すため、この除外が本対策の核心。
      expect(
        findGitExecutable({
          platform: 'win32',
          pathValue: '.;C:\\Windows\\system32',
          isExecutableFile: () => true,
        }),
      ).toBe('C:\\Windows\\system32\\git.COM');
    });

    it('拡張子なしの git は候補にしない', () => {
      expect(
        findGitExecutable({
          ...win32,
          isExecutableFile: executableSet(['C:\\Program Files\\Git\\cmd\\git']),
        }),
      ).toBeNull();
    });
  });
});

describe('findGitExecutable（既定の実行ファイル判定）', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'git-executable-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('実行権限のあるファイルだけを候補にする（ディレクトリ・非実行ファイルは飛ばす）', () => {
    const asDir = join(root, 'as-dir');
    const notExecutable = join(root, 'not-exec');
    const executable = join(root, 'exec');
    mkdirSync(join(asDir, 'git'), { recursive: true });
    mkdirSync(notExecutable);
    mkdirSync(executable);
    writeFileSync(join(notExecutable, 'git'), '');
    chmodSync(join(notExecutable, 'git'), 0o644);
    writeFileSync(join(executable, 'git'), '');
    chmodSync(join(executable, 'git'), 0o755);

    expect(
      findGitExecutable({
        platform: 'linux',
        pathValue: [asDir, notExecutable, executable].join(':'),
      }),
    ).toBe(join(executable, 'git'));
  });

  it('存在しないディレクトリを含んでいても落ちない', () => {
    expect(
      findGitExecutable({ platform: 'linux', pathValue: join(root, 'missing') }),
    ).toBeNull();
  });
});

describe('resolveGitExecutable', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    // 実行環境の ANYTIME_GIT_PATH / PATH に結果が左右されないようにする。
    delete process.env[GIT_PATH_ENV];
  });

  afterEach(() => {
    resetGitExecutableCacheForTest();
    process.env = { ...savedEnv };
  });

  it('環境変数 ANYTIME_GIT_PATH の絶対パスを最優先で使う', () => {
    expect(
      resolveGitExecutable({
        platform: 'linux',
        gitPathOverride: '/opt/git/bin/git',
        pathValue: '/usr/bin',
        isExecutableFile: executableSet(['/opt/git/bin/git', '/usr/bin/git']),
      }),
    ).toBe('/opt/git/bin/git');
  });

  it('ANYTIME_GIT_PATH が相対パスなら拒否する（cwd 依存を持ち込ませない）', () => {
    expect(() =>
      resolveGitExecutable({
        platform: 'linux',
        gitPathOverride: './git',
        pathValue: '/usr/bin',
        isExecutableFile: executableSet(['/usr/bin/git']),
      }),
    ).toThrow(/ANYTIME_GIT_PATH/);
  });

  it('ANYTIME_GIT_PATH が実行ファイルを指していなければ拒否する', () => {
    // 実在確認を怠ると、以後すべての git 実行が呼び出し側の catch で ENOENT として散る。
    expect(() =>
      resolveGitExecutable({
        platform: 'linux',
        gitPathOverride: '/opt/git/bin/git',
        pathValue: '/usr/bin',
        isExecutableFile: executableSet(['/usr/bin/git']),
      }),
    ).toThrow(/does not point to an executable file/);
  });

  it('解決できなければ例外を投げる（cwd の git へフォールバックしない）', () => {
    expect(() =>
      resolveGitExecutable({
        platform: 'linux',
        pathValue: '/usr/bin',
        isExecutableFile: executableSet([]),
      }),
    ).toThrow(GitExecutableNotFoundError);
  });

  it('プロセス既定での解決は 2 回目以降キャッシュを使う', () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-executable-cache-'));
    try {
      const exe = join(dir, 'git');
      writeFileSync(exe, '');
      chmodSync(exe, 0o755);
      process.env[GIT_PATH_ENV] = exe;
      expect(resolveGitExecutable()).toBe(exe);
      // キャッシュが効いていれば、環境変数を消しても同じ値が返る。
      delete process.env[GIT_PATH_ENV];
      expect(resolveGitExecutable()).toBe(exe);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('解決入力を差し替えた呼び出しはキャッシュを共有しない', () => {
    // 最初の呼び出しの文脈が以後すべてを固定してしまうのを防ぐ。
    expect(
      resolveGitExecutable({
        platform: 'linux',
        pathValue: '/usr/bin',
        isExecutableFile: executableSet(['/usr/bin/git']),
      }),
    ).toBe('/usr/bin/git');
    expect(
      resolveGitExecutable({
        platform: 'linux',
        pathValue: '/opt/bin',
        isExecutableFile: executableSet(['/opt/bin/git']),
      }),
    ).toBe('/opt/bin/git');
  });

  it('失敗はキャッシュしない（PATH 修正後に回復できる）', () => {
    expect(() =>
      resolveGitExecutable({
        platform: 'linux',
        pathValue: '/usr/bin',
        isExecutableFile: executableSet([]),
      }),
    ).toThrow();
    expect(
      resolveGitExecutable({
        platform: 'linux',
        pathValue: '/usr/bin',
        isExecutableFile: executableSet(['/usr/bin/git']),
      }),
    ).toBe('/usr/bin/git');
  });
});
