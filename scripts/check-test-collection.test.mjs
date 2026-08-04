import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ALLOWLIST,
  collectTestFiles,
  findJestPackages,
  isAllowlisted,
  parseListTestsOutput,
  selectUncollected,
} from './check-test-collection.mjs';

test('収集済みのテストは漏れとして挙げない', () => {
  const actual = ['packages/a/src/__tests__/x.test.ts'];
  assert.deepEqual(selectUncollected(actual, actual, []), []);
});

test('存在するのに収集されていないテストを挙げる', () => {
  const actual = [
    'packages/a/src/__tests__/x.test.ts',
    'packages/a/src/__tests__/y.test.tsx',
  ];
  const listed = ['packages/a/src/__tests__/x.test.ts'];
  assert.deepEqual(selectUncollected(actual, listed, []), ['packages/a/src/__tests__/y.test.tsx']);
});

test('allowlist の前方一致は漏れから除く', () => {
  const actual = ['packages/web-app/e2e/toolbar.spec.ts'];
  assert.deepEqual(selectUncollected(actual, [], ALLOWLIST), []);
  assert.equal(isAllowlisted('packages/web-app/e2e/toolbar.spec.ts', ALLOWLIST), true);
  assert.equal(isAllowlisted('packages/web-app/src/__tests__/a.test.ts', ALLOWLIST), false);
});

test('allowlist の各エントリは理由を持つ（理由なしの除外を許さない）', () => {
  for (const entry of ALLOWLIST) {
    assert.ok(entry.prefix.length > 0, 'prefix が空');
    assert.ok(entry.reason && entry.reason.length > 0, `理由がない: ${entry.prefix}`);
  }
});

test('結果は昇順で安定する（差分ノイズを出さない）', () => {
  const actual = ['packages/b/z.test.ts', 'packages/a/a.test.ts'];
  assert.deepEqual(selectUncollected(actual, [], []), [
    'packages/a/a.test.ts',
    'packages/b/z.test.ts',
  ]);
});

test('--listTests の出力から絶対パス行だけを拾い repo 相対へ直す', () => {
  const stdout = [
    'ts-jest[config] (WARN) ...',
    '/repo/packages/a/src/__tests__/x.test.ts',
    '  /repo/packages/a/src/__tests__/y.test.tsx  ',
    '',
  ].join('\n');
  assert.deepEqual(parseListTestsOutput(stdout, '/repo'), [
    'packages/a/src/__tests__/x.test.ts',
    'packages/a/src/__tests__/y.test.tsx',
  ]);
});

test('走査は node_modules / dist を除外し .tsx も拾う', () => {
  const root = mkdtempSync(join(tmpdir(), 'check-test-collection-'));
  try {
    mkdirSync(join(root, 'packages/a/src/__tests__'), { recursive: true });
    mkdirSync(join(root, 'packages/a/node_modules/dep/__tests__'), { recursive: true });
    mkdirSync(join(root, 'packages/a/dist/__tests__'), { recursive: true });
    writeFileSync(join(root, 'packages/a/src/__tests__/x.test.ts'), '');
    writeFileSync(join(root, 'packages/a/src/__tests__/y.test.tsx'), '');
    writeFileSync(join(root, 'packages/a/src/__tests__/z.ts'), '');
    writeFileSync(join(root, 'packages/a/node_modules/dep/__tests__/dep.test.ts'), '');
    writeFileSync(join(root, 'packages/a/dist/__tests__/built.test.js'), '');

    const found = collectTestFiles(join(root, 'packages/a'), root).sort();
    assert.deepEqual(found, [
      'packages/a/src/__tests__/x.test.ts',
      'packages/a/src/__tests__/y.test.tsx',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('jest 設定を持つパッケージだけを対象にする', () => {
  const root = mkdtempSync(join(tmpdir(), 'check-test-collection-pkg-'));
  try {
    mkdirSync(join(root, 'packages/withConfig'), { recursive: true });
    mkdirSync(join(root, 'packages/without'), { recursive: true });
    writeFileSync(join(root, 'packages/withConfig/jest.config.js'), 'module.exports = {};');

    const found = findJestPackages(root).map((p) => p.configPath.replace(root + '/', ''));
    assert.deepEqual(found, ['packages/withConfig/jest.config.js']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('本番の ALLOWLIST が「収集される側」を誤って隠していない', () => {
  // allowlist は別ランナー担当分だけを覆う。src 配下の通常テストを覆っていたら、
  // 本物の収集漏れが永久に見えなくなる。
  for (const entry of ALLOWLIST) {
    assert.ok(
      !entry.prefix.includes('/src/__tests__'),
      `通常のユニットテスト置き場を除外している: ${entry.prefix}`,
    );
  }
});
