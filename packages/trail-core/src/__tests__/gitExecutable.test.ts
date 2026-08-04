import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  findGitExecutable,
  resolveGitExecutable,
  resetGitExecutableCacheForTest,
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

    it('PATHEXT の拡張子を順に試す', () => {
      expect(
        findGitExecutable({
          ...win32,
          pathExtValue: '.COM;.EXE;.BAT;.CMD',
          isExecutableFile: executableSet(['C:\\Program Files\\Git\\cmd\\git.EXE']),
        }),
      ).toBe('C:\\Program Files\\Git\\cmd\\git.EXE');
    });

    it('PATHEXT が未設定なら既定の拡張子集合を使う', () => {
      expect(
        findGitExecutable({
          ...win32,
          pathExtValue: undefined,
          isExecutableFile: executableSet(['C:\\Program Files\\Git\\cmd\\git.CMD']),
        }),
      ).toBe('C:\\Program Files\\Git\\cmd\\git.CMD');
    });

    it('引用符付きの PATH エントリを剥がして解決する', () => {
      expect(
        findGitExecutable({
          platform: 'win32',
          pathValue: '"C:\\Program Files\\Git\\cmd"',
          pathExtValue: '.EXE',
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
          pathExtValue: '.EXE',
          isExecutableFile: () => true,
        }),
      ).toBe('C:\\Windows\\system32\\git.EXE');
    });

    it('拡張子なしの git は候補にしない', () => {
      expect(
        findGitExecutable({
          ...win32,
          pathExtValue: '.EXE',
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
  afterEach(() => {
    resetGitExecutableCacheForTest();
  });

  it('環境変数 ANYTIME_GIT_PATH の絶対パスを最優先で使う', () => {
    expect(
      resolveGitExecutable({
        platform: 'linux',
        gitPathOverride: '/opt/git/bin/git',
        pathValue: '/usr/bin',
        isExecutableFile: executableSet(['/usr/bin/git']),
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

  it('解決できなければ例外を投げる（cwd の git へフォールバックしない）', () => {
    expect(() =>
      resolveGitExecutable({
        platform: 'linux',
        pathValue: '/usr/bin',
        isExecutableFile: executableSet([]),
      }),
    ).toThrow(/git executable/);
  });

  it('2 回目以降は探索し直さない', () => {
    const isExecutableFile = jest.fn(executableSet(['/usr/bin/git']));
    const options = { platform: 'linux' as NodeJS.Platform, pathValue: '/usr/bin', isExecutableFile };
    expect(resolveGitExecutable(options)).toBe('/usr/bin/git');
    const callsAfterFirst = isExecutableFile.mock.calls.length;
    expect(resolveGitExecutable(options)).toBe('/usr/bin/git');
    expect(isExecutableFile.mock.calls.length).toBe(callsAfterFirst);
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
