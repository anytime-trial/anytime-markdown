'use strict';

// test はランナー(jest)のグローバルを使う。node:test から import すると jest 配下で suite ごと落ちる。
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ct = require('./collect-tests.cjs');

test('parseTestFile は describe の入れ子をタイトルパスに積み、テストごとにキーを作る', () => {
  const src = [
    "describe('ProcessFlow', () => {",
    "  it('内訳を表示する', () => {",
    '    expect(a).toBe(1);',
    '  });',
    "  describe('英語', () => {",
    "    it('同じ内訳を表示する', () => {",
    '      expect(b).toBe(2);',
    '    });',
    '  });',
    '});',
    "it('トップレベル', () => {",
    '  assert.equal(c, 3);',
    '});',
  ].join('\n');
  const tests = ct.parseTestFile(src, 'src/__tests__/a.test.tsx');
  assert.deepStrictEqual(
    tests.map((t) => t.key),
    [
      'src/__tests__/a.test.tsx::ProcessFlow > 内訳を表示する',
      'src/__tests__/a.test.tsx::ProcessFlow > 英語 > 同じ内訳を表示する',
      'src/__tests__/a.test.tsx::トップレベル',
    ],
  );
  assert.deepStrictEqual(tests.map((t) => t.line), [2, 6, 11]);
  assert.ok(tests.every((t) => t.assertions > 0));
});

test('parseTestFile は skip / only / todo / fixme と、describe 側の skip を継承したフラグを付ける', () => {
  const src = [
    "describe.skip('止めた群', () => {",
    "  it('中身', () => { expect(1).toBe(1); });",
    '});',
    "test.only('だけ', () => { expect(1).toBe(1); });",
    "it.todo('あとで');",
    "test.fixme('壊れている', async () => { expect(1).toBe(1); });",
  ].join('\n');
  const flags = ct.parseTestFile(src, 'e2e/x.spec.ts').map((t) => [t.title, t.flags]);
  assert.deepStrictEqual(flags, [
    ['中身', ['skip']],
    ['だけ', ['only']],
    ['あとで', ['todo']],
    ['壊れている', ['fixme']],
  ]);
});

test('parseTestFile は Playwright の test.describe とテンプレート文字列のタイトルを拾い、e2e を判別する', () => {
  const src = [
    "test.describe('一覧', () => {",
    '  test(`開ける`, async ({ page }) => {',
    '    await expect(page).toHaveURL(/x/);',
    '  });',
    '});',
  ].join('\n');
  const [t] = ct.parseTestFile(src, 'packages/web-app/e2e/list.spec.ts');
  assert.strictEqual(t.key, 'packages/web-app/e2e/list.spec.ts::一覧 > 開ける');
  assert.strictEqual(t.kind, 'e2e');
  assert.strictEqual(ct.parseTestFile("it('u', () => { expect(1).toBe(1); });", 'src/a.test.ts')[0].kind, 'unit');
});

test('parseTestFile はアサーションの無いテストを assertions 0 として返す（todo は対象外）', () => {
  const src = [
    "it('呼ぶだけ', () => {",
    '  render(<X />);',
    '});',
    "it('確かめる', () => {",
    '  expect(screen.getByText("a")).toBeTruthy();',
    '});',
  ].join('\n');
  const tests = ct.parseTestFile(src, 'src/a.test.tsx');
  assert.deepStrictEqual(tests.map((t) => t.assertions), [0, 1]);
});

test('parseTestFile は同名のテストのキーに連番を付けて衝突させない', () => {
  const src = ["it('同じ', () => { expect(1).toBe(1); });", "it('同じ', () => { expect(2).toBe(2); });"].join('\n');
  assert.deepStrictEqual(
    ct.parseTestFile(src, 'a.test.ts').map((t) => t.key),
    ['a.test.ts::同じ', 'a.test.ts::同じ #2'],
  );
});

test('changedLineRanges は git diff -U0 の追加側の行範囲を返す（削除のみの hunk は前後 2 行を指す）', () => {
  const diff = [
    'diff --git a/a.test.ts b/a.test.ts',
    '@@ -3,0 +4,2 @@',
    '+x',
    '+y',
    '@@ -10 +12 @@',
    '-a',
    '+b',
    '@@ -20,3 +21,0 @@',
  ].join('\n');
  assert.deepStrictEqual(ct.changedLineRanges(diff), [
    [4, 5],
    [12, 12],
    [21, 22],
  ]);
});

test('markChanged は行範囲が重なるテストだけを changed にする', () => {
  const tests = [
    { line: 1, endLine: 5 },
    { line: 6, endLine: 10 },
    { line: 11, endLine: 15 },
  ];
  const marked = ct.markChanged(tests, [[7, 7]]);
  assert.deepStrictEqual(marked.map((t) => t.changed), [false, true, false]);
});

test('extractSpecKeys は既存仕様書のテストキー列（バッククォート内の path::title）を集める', () => {
  const md = [
    '| ID | テストキー | 確かめること |',
    '| --- | --- | --- |',
    '| T-001 | `src/a.test.ts::群 > 項目` | x |',
    '| T-002 | `e2e/b.spec.ts::開ける` | y |',
    '本文中の `npm test` は拾わない。',
  ].join('\n');
  assert.deepStrictEqual(ct.extractSpecKeys(md), ['src/a.test.ts::群 > 項目', 'e2e/b.spec.ts::開ける']);
});

test('diffKeys は追加・削除・継続に分ける', () => {
  assert.deepStrictEqual(ct.diffKeys(['a', 'b'], ['b', 'c']), { added: ['c'], removed: ['a'], kept: ['b'] });
});

test('collect はディレクトリを走査してテストファイルだけを集め、node_modules を除外する', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-spec-'));
  try {
    fs.mkdirSync(path.join(root, 'src', '__tests__'), { recursive: true });
    fs.mkdirSync(path.join(root, 'node_modules', 'pkg'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', '__tests__', 'a.test.ts'), "it('a', () => { expect(1).toBe(1); });\n");
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), "it('not a test file', () => {});\n");
    fs.writeFileSync(path.join(root, 'node_modules', 'pkg', 'b.test.js'), "it('b', () => {});\n");

    const result = ct.collect({ root, paths: ['.'] });
    assert.deepStrictEqual(result.tests.map((t) => t.key), ['src/__tests__/a.test.ts::a']);
    assert.strictEqual(result.summary.tests, 1);
    assert.strictEqual(result.summary.files, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('collect は previous を渡すと既存仕様書との差分を返す', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-spec-'));
  try {
    fs.writeFileSync(path.join(root, 'a.test.ts'), "it('新', () => { expect(1).toBe(1); });\n");
    fs.writeFileSync(path.join(root, 'spec.md'), '| T-001 | `a.test.ts::旧` | x |\n');
    const result = ct.collect({ root, paths: ['a.test.ts'], previous: path.join(root, 'spec.md') });
    assert.deepStrictEqual(result.diff, { added: ['a.test.ts::新'], removed: ['a.test.ts::旧'], kept: [] });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('collect は root が git リポジトリのサブディレクトリでも since 以降の変更テストだけを changed にする', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'test-spec-git-'));
  const run = (...args) => require('node:child_process').execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
  try {
    run('init', '-q');
    run('config', 'user.email', 't@example.com');
    run('config', 'user.name', 't');
    const pkg = path.join(repo, 'packages', 'app');
    fs.mkdirSync(pkg, { recursive: true });
    const file = path.join(pkg, 'a.test.ts');
    fs.writeFileSync(file, ["it('不変', () => {", '  expect(1).toBe(1);', '});', "it('変更', () => {", '  expect(2).toBe(2);', '});', ''].join('\n'));
    run('add', '.');
    run('commit', '-q', '-m', 'base');
    fs.writeFileSync(file, ["it('不変', () => {", '  expect(1).toBe(1);', '});', "it('変更', () => {", '  expect(2).toBe(3);', '});', ''].join('\n'));

    const result = ct.collect({ root: pkg, paths: ['.'], since: 'HEAD' });
    assert.deepStrictEqual(result.tests.map((t) => [t.title, t.changed]), [
      ['不変', false],
      ['変更', true],
    ]);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
