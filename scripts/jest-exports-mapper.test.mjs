// jest-exports-mapper.cjs のテスト。
//
// 背景: jest の moduleNameMapper に `^@scope/pkg/(.*)$` → `src/$1` のワイルドカードを
// 手書きすると、package.json の exports が「subpath ＝ src 以下のパス」という規約から
// 外れた瞬間に解決できなくなる（trail-core の `./c4/services` → `src/c4/services/catalog.ts`）。
// exports を単一の正として mapper を生成することで、この乖離を構造的に断つ。
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import mapper from './jest-exports-mapper.cjs';

const { buildModuleNameMapperFromExports, listExportTargets } = mapper;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('ルート "." をパッケージ名の完全一致へ写す', () => {
  const m = buildModuleNameMapperFromExports('@x/pkg', { '.': './src/index.ts' }, '<rootDir>/../pkg');
  assert.deepEqual(m, { '^@x/pkg$': '<rootDir>/../pkg/src/index.ts' });
});

test('subpath ごとに完全一致のエントリを作る', () => {
  const m = buildModuleNameMapperFromExports('@x/pkg', { './analyze': './src/analyze.ts' }, '<rootDir>/../pkg');
  assert.deepEqual(m, { '^@x/pkg/analyze$': '<rootDir>/../pkg/src/analyze.ts' });
});

test('subpath と実ファイルの位置がずれていても exports の宣言どおりに写す', () => {
  // これがワイルドカード手書きでは表現できず、今回の不具合の原因になったケース。
  const m = buildModuleNameMapperFromExports(
    '@x/pkg',
    { './c4/services': './src/c4/services/catalog.ts' },
    '<rootDir>/../pkg',
  );
  assert.deepEqual(m, { '^@x/pkg/c4/services$': '<rootDir>/../pkg/src/c4/services/catalog.ts' });
});

test('subpath 中のドットを正規表現として扱わない', () => {
  const m = buildModuleNameMapperFromExports('@x/pkg', { './a.b': './src/a.b.ts' }, '<rootDir>/../pkg');
  assert.deepEqual(m, { '^@x/pkg/a\\.b$': '<rootDir>/../pkg/src/a.b.ts' });
});

test('条件付きエクスポートは default を採る', () => {
  const m = buildModuleNameMapperFromExports(
    '@x/pkg',
    { './cat': { browser: './src/cat/browser.ts', default: './src/cat/index.ts' } },
    '<rootDir>/../pkg',
  );
  assert.deepEqual(m, { '^@x/pkg/cat$': '<rootDir>/../pkg/src/cat/index.ts' });
});

test('default が無い条件付きエクスポートは最初の文字列を採る', () => {
  const m = buildModuleNameMapperFromExports(
    '@x/pkg',
    { './cat': { browser: './src/cat/browser.ts' } },
    '<rootDir>/../pkg',
  );
  assert.deepEqual(m, { '^@x/pkg/cat$': '<rootDir>/../pkg/src/cat/browser.ts' });
});

test('ワイルドカードの * をキャプチャへ写す', () => {
  const m = buildModuleNameMapperFromExports('@x/pkg', { './*': './src/*.ts' }, '<rootDir>/../pkg');
  assert.deepEqual(m, { '^@x/pkg/(.*)$': '<rootDir>/../pkg/src/$1.ts' });
});

test('完全一致を先に、ワイルドカードは前置きが長い順に並べる', () => {
  // jest は moduleNameMapper を宣言順に評価して最初に一致したものを使うため、
  // 緩いパターンが先に来ると具体的なエントリが到達不能になる。
  const m = buildModuleNameMapperFromExports(
    '@x/pkg',
    { './*': './src/*.ts', './src/*': './src/*', './a': './src/a.ts', '.': './src/index.ts' },
    '<rootDir>/../pkg',
  );
  assert.deepEqual(Object.keys(m), [
    '^@x/pkg$',
    '^@x/pkg/a$',
    '^@x/pkg/src/(.*)$',
    '^@x/pkg/(.*)$',
  ]);
});

test('exports が無いパッケージは空の mapper を返す', () => {
  assert.deepEqual(buildModuleNameMapperFromExports('@x/pkg', undefined, '<rootDir>/../pkg'), {});
});

test('listExportTargets はワイルドカードを除いた実ファイル参照を返す', () => {
  const targets = listExportTargets({
    '.': './src/index.ts',
    './a': './src/a.ts',
    './*': './src/*.ts',
    './cat': { browser: './src/cat/browser.ts', default: './src/cat/index.ts' },
  });
  assert.deepEqual(targets.sort(), ['./src/a.ts', './src/cat/browser.ts', './src/cat/index.ts', './src/index.ts']);
});

test('全ワークスペースの exports が実在するソースを指す', () => {
  // dangling export（ソース削除後に exports エントリだけ残る）を CI で検知する。
  // dist/ 配下はビルド成果物で未ビルド環境では存在しないため対象外。
  const workspaces = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).workspaces;
  const missing = [];
  for (const ws of workspaces) {
    const pkgPath = join(repoRoot, ws, 'package.json');
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    for (const target of listExportTargets(pkg.exports)) {
      if (!target.startsWith('./src/')) continue;
      if (!existsSync(join(repoRoot, ws, target))) missing.push(`${pkg.name}: ${target}`);
    }
  }
  assert.deepEqual(missing, []);
});
