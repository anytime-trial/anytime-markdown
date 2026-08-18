const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  ArgumentError,
  parseArgs,
  checkVerifyCommand,
  decideDelegation,
  formatLine,
} = require('./delegation-triage.cjs');

function makeWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'delegation-triage-test-'));
  const packageDir = path.join(root, 'packages', 'agent-dir');
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify({ name: 'anytime-agent', scripts: { compile: 'webpack', test: 'jest' } }),
  );
  fs.mkdirSync(path.join(root, 'tests'));
  fs.writeFileSync(path.join(root, 'tests', 'unit.test.cjs'), '');
  fs.writeFileSync(path.join(root, 'tsconfig.json'), '{}');
  return root;
}

function inputs(overrides = {}) {
  return {
    paths: ['a.ts'],
    files: 3,
    lines: 120,
    severity: 'low',
    verify: 'custom verify',
    interactiveDesign: null,
    workspace: process.cwd(),
    ...overrides,
  };
}

describe('parseArgs', () => {
  it('必須値と省略可能値を正規化し、severity の既定値を low にする', () => {
    const parsed = parseArgs(['--paths', 'a.ts, b.ts', '--files', '3', '--lines', '120']);
    expect(parsed).toMatchObject({
      paths: ['a.ts', 'b.ts'],
      files: 3,
      lines: 120,
      severity: 'low',
      verify: null,
      interactiveDesign: null,
      json: false,
    });
  });

  it.each([
    [['--paths', 'a.ts', '--lines', '1'], '--files は必須です'],
    [['--paths', 'a.ts', '--files', 'x', '--lines', '1'], '--files は 0 以上の数値'],
    [['--paths', 'a.ts', '--files', '1', '--lines', '-1'], '--lines は 0 以上の数値'],
    [['--paths', 'a.ts', '--files', '1', '--lines', '1', '--severity', 'critical'], '--severity の値が不正'],
    [['--paths', 'a.ts', '--files', '1', '--lines', '1', '--wat'], '未知のオプション'],
  ])('必須値欠落・不正値・未知オプションを引数不備にする: %s', (argv, message) => {
    expect(() => parseArgs(argv)).toThrow(ArgumentError);
    expect(() => parseArgs(argv)).toThrow(message);
  });

  it('--paths の未指定・空文字・空要素を空配列にする', () => {
    expect(parseArgs(['--files', '2', '--lines', '20']).paths).toEqual([]);
    expect(parseArgs(['--paths', '', '--files', '2', '--lines', '20']).paths).toEqual([]);
    expect(parseArgs(['--paths', ' , ', '--files', '2', '--lines', '20']).paths).toEqual([]);
  });
});

describe('checkVerifyCommand', () => {
  let workspace;

  beforeEach(() => {
    workspace = makeWorkspace();
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('npm script をディレクトリ名と package name の両方で検査する', () => {
    expect(checkVerifyCommand('npm run compile -w agent-dir', workspace)).toEqual({
      available: true,
      checked: true,
      status: 'ok',
    });
    expect(checkVerifyCommand('npm run compile -w anytime-agent', workspace)).toEqual({
      available: true,
      checked: true,
      status: 'ok',
    });
    expect(checkVerifyCommand('npm run missing -w anytime-agent', workspace)).toMatchObject({
      available: false,
      checked: true,
      status: 'ng',
    });
  });

  it('lifecycle 省略形（npm test -w <pkg>）も scripts で解決する', () => {
    expect(checkVerifyCommand('npm test -w anytime-agent', workspace)).toEqual({
      available: true,
      checked: true,
      status: 'ok',
    });
  });

  it('npm install -w <pkg> を script 名と誤読せず unchecked で通す', () => {
    expect(checkVerifyCommand('npm install -w anytime-agent', workspace)).toEqual({
      available: true,
      checked: false,
      status: 'unchecked',
    });
  });

  it('jest と tsc の対象パスの実在を workspace 起点で検査する', () => {
    expect(checkVerifyCommand('npx jest tests/unit.test.cjs', workspace).available).toBe(true);
    expect(checkVerifyCommand('npx tsc -p tsconfig.json', workspace).available).toBe(true);
    expect(checkVerifyCommand('npx tsc --noEmit -p missing.json', workspace)).toEqual({
      available: false,
      checked: true,
      status: 'ng',
    });
  });

  it('未指定は ng、認識不能な書式は unchecked で通過させる', () => {
    expect(checkVerifyCommand(null, workspace)).toEqual({
      available: false,
      checked: false,
      status: 'ng',
    });
    expect(checkVerifyCommand('node custom-check.cjs', workspace)).toEqual({
      available: true,
      checked: false,
      status: 'unchecked',
    });
  });
});

describe('decideDelegation', () => {
  it.each([
    ['E1', { severity: 'high', paths: [], verify: null, files: 0, lines: 0 }],
    ['E5', { paths: [], verify: null, files: 0, lines: 0 }],
    ['E3', { verify: null }],
    ['E4', { interactiveDesign: '対話で API を決める' }],
    ['E2', { files: 1, lines: 19 }],
  ])('%s の除外分岐で main を選ぶ', (exclusion, overrides) => {
    expect(decideDelegation(inputs(overrides))).toMatchObject({ decision: 'main', exclusion });
  });

  it('除外なしでは codex を選び、境界 files=1 lines=20 は E2 にしない', () => {
    expect(decideDelegation(inputs({ files: 1, lines: 20 }))).toMatchObject({
      decision: 'codex',
      exclusion: null,
      verifyChecked: false,
      verifyStatus: 'unchecked',
    });
  });

  it('先に該当した E1 を採用し、verify を評価しない', () => {
    expect(decideDelegation(inputs({ severity: 'high', verify: null }))).toEqual({
      decision: 'main',
      exclusion: 'E1',
      verifyChecked: false,
      verifyStatus: 'unchecked',
    });
  });

  it('空文字の interactive-design は E4 にしない', () => {
    expect(decideDelegation(inputs({ interactiveDesign: '   ' })).decision).toBe('codex');
  });
});

describe('formatLine', () => {
  it('codex と main のルート宣言を指定書式で整形する', () => {
    const base = inputs();
    expect(
      formatLine(
        { decision: 'codex', exclusion: null, verifyStatus: 'ok' },
        base,
      ),
    ).toBe('実行手段: codex — 除外なし（files=3 lines=120 severity=low verify=ok）');
    expect(
      formatLine(
        { decision: 'main', exclusion: 'E2', verifyStatus: 'unchecked' },
        { ...base, files: 1, lines: 19 },
      ),
    ).toBe('実行手段: main[E2] — 小規模変更（files=1 lines=19 severity=low verify=unchecked）');
  });
});

describe('CLI', () => {
  const script = path.join(__dirname, 'delegation-triage.cjs');

  it('--json で 1 行 JSON を出し、成功時は終了コード 0 にする', () => {
    const result = spawnSync(
      process.execPath,
      [script, '--paths', 'a.ts', '--files', '3', '--lines', '120', '--verify', 'custom verify', '--json'],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(result.stdout)).toEqual({
      decision: 'codex',
      exclusion: null,
      verifyChecked: false,
      inputs: {
        paths: ['a.ts'],
        files: 3,
        lines: 120,
        severity: 'low',
        verify: 'custom verify',
        interactiveDesign: null,
      },
      line: '実行手段: codex — 除外なし（files=3 lines=120 severity=low verify=unchecked）',
    });
  });

  it('引数不備は終了コード 2 と理由・使い方を stderr に出す', () => {
    const result = spawnSync(process.execPath, [script, '--paths', 'a.ts', '--files', '1'], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--lines は必須です');
    expect(result.stderr).toContain('使い方:');
  });
});
