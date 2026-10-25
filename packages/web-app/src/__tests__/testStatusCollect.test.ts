import {
  countFixesByPackage,
  countSmells,
  findAbsolutePaths,
  isTestFile,
  parseCiTestPackages,
} from '../lib/testStatus/collect';

const CI_YML = `
jobs:
  ci:
    steps:
      - name: Run graph-core tests with coverage
        if: github.event_name == 'pull_request'
        run: npx jest --maxWorkers=1 --coverage
        working-directory: packages/graph-core

      - name: Build markdown extension
        run: npm run package
        working-directory: packages/vscode-markdown-extension

      - name: Run trail extension tests (isolated HOME)
        working-directory: packages/vscode-trail-extension
        env:
          HOME: /tmp/home
        run: |
          mkdir -p "$HOME"
          npx jest --maxWorkers=1

      - name: Run web-app tests
        run: npm test
        working-directory: packages/web-app
`;

const ACTION_YML = `
runs:
  steps:
    - shell: bash
      run: |
        ALL="cms-core mcp-cms \\
             trail-db"
        for p in $ALL; do
`;

describe('parseCiTestPackages', () => {
  it('テストを実行するステップの working-directory と coverage-remaining の一覧を集める', () => {
    expect([...parseCiTestPackages(CI_YML, ACTION_YML)].sort()).toEqual([
      'cms-core',
      'graph-core',
      'mcp-cms',
      'trail-db',
      'vscode-trail-extension',
      'web-app',
    ]);
  });

  it('ビルドだけのステップのパッケージは含めない', () => {
    expect(parseCiTestPackages(CI_YML, ACTION_YML).has('vscode-markdown-extension')).toBe(false);
  });

  it('coverage-remaining に ALL が無くても ci.yml の分だけ返す', () => {
    expect([...parseCiTestPackages(CI_YML, 'runs: {}')].sort()).toEqual([
      'graph-core',
      'vscode-trail-extension',
      'web-app',
    ]);
  });
});

describe('countFixesByPackage', () => {
  it('fix(<package>/<category>) と fix(<package>) を package ごとに数え、他の型は数えない', () => {
    const log = [
      'fix(trail-db/logic): A',
      'fix(trail-db): B',
      'fix(web-app/spec): C',
      'feat(trail-db): D',
      'merge: E',
      '',
    ].join('\n');
    expect(countFixesByPackage(log)).toEqual({ 'trail-db': 2, 'web-app': 1 });
  });
});

describe('countSmells', () => {
  it('カバレッジ目的のファイル名・弱い検証・expect の数を合計する', () => {
    expect(
      countSmells([
        {
          name: 'diffEngine.coverage3.test.ts',
          source: 'expect(a).toBe(1); expect(b).toBeDefined(); expect(() => f()).not.toThrow();',
        },
        { name: 'parser.additional.test.ts', source: 'expect(x).toBeTruthy();' },
        { name: 'parser.test.ts', source: 'expect(x).toEqual(2);' },
      ]),
    ).toEqual({ coverageNamed: 2, weak: 3, expects: 5 });
  });

  it('名前に coverage を含んでも .test. で終わらないファイルは数えない', () => {
    expect(countSmells([{ name: 'coverageHelpers.ts', source: '' }]).coverageNamed).toBe(0);
  });
});

describe('isTestFile', () => {
  it.each([
    ['src/__tests__/a.test.ts', true],
    ['src/a.spec.tsx', true],
    ['scripts/a.test.mjs', true],
    ['src/a.ts', false],
    ['src/testHelpers.ts', false],
  ])('%s は %s', (path, expected) => {
    expect(isTestFile(path)).toBe(expected);
  });
});

describe('findAbsolutePaths', () => {
  it('ホーム・一時ディレクトリ・Windows ドライブの絶対パスを見つける', () => {
    expect(
      findAbsolutePaths('{"a":"/home/user/x","b":"/tmp/y","c":"C:\\\\Users\\\\z","d":"/Users/w"}'),
    ).toEqual(['/home/user/x', '/tmp/y', 'C:\\\\Users\\\\z', '/Users/w']);
  });

  it('パッケージ名とリポジトリ相対の値だけなら空を返す', () => {
    expect(findAbsolutePaths('{"package":"trail-db","path":"packages/trail-db"}')).toEqual([]);
  });
});
