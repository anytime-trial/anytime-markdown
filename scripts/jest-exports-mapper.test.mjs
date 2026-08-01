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

/** 定型引数を埋めた呼び出しヘルパ。 */
function build(exports, conditions) {
  return buildModuleNameMapperFromExports({
    packageName: '@x/pkg',
    exports,
    rootToken: '<rootDir>/../pkg',
    ...(conditions ? { conditions } : {}),
  });
}

test('ルート "." をパッケージ名の完全一致へ写す', () => {
  assert.deepEqual(build({ '.': './src/index.ts' }), { '^@x/pkg$': '<rootDir>/../pkg/src/index.ts' });
});

test('subpath ごとに完全一致のエントリを作る', () => {
  assert.deepEqual(build({ './analyze': './src/analyze.ts' }), {
    '^@x/pkg/analyze$': '<rootDir>/../pkg/src/analyze.ts',
  });
});

test('subpath と実ファイルの位置がずれていても exports の宣言どおりに写す', () => {
  // これがワイルドカード手書きでは表現できず、今回の不具合の原因になったケース。
  assert.deepEqual(build({ './c4/services': './src/c4/services/catalog.ts' }), {
    '^@x/pkg/c4/services$': '<rootDir>/../pkg/src/c4/services/catalog.ts',
  });
});

test('subpath 中のドットを正規表現として扱わない', () => {
  assert.deepEqual(build({ './a.b': './src/a.b.ts' }), { '^@x/pkg/a\\.b$': '<rootDir>/../pkg/src/a.b.ts' });
});

test('条件付きエクスポートは conditions の優先順で選ぶ（宣言順ではない）', () => {
  const exports = { './cat': { browser: './src/cat/browser.ts', default: './src/cat/index.ts' } };
  assert.deepEqual(build(exports, ['browser', 'default']), { '^@x/pkg/cat$': '<rootDir>/../pkg/src/cat/browser.ts' });
  assert.deepEqual(build(exports, ['default']), { '^@x/pkg/cat$': '<rootDir>/../pkg/src/cat/index.ts' });
});

test('conditions 既定は default のみ', () => {
  const m = build({ './cat': { browser: './src/cat/browser.ts', default: './src/cat/index.ts' } });
  assert.deepEqual(m, { '^@x/pkg/cat$': '<rootDir>/../pkg/src/cat/index.ts' });
});

test('types は実行時ターゲットに選ばない', () => {
  // types は .d.ts（型宣言）で実行時は空モジュール相当。宣言順の先頭でも採ってはいけない。
  const m = buildModuleNameMapperFromExports({
    packageName: '@x/pkg',
    exports: { '.': { types: './dist/index.d.ts', import: './dist/pkg.js' } },
    rootToken: '<rootDir>/../pkg',
    conditions: ['import', 'default'],
  });
  assert.deepEqual(m, { '^@x/pkg$': '<rootDir>/../pkg/dist/pkg.js' });
});

test('入れ子の条件付きエクスポートを解決する', () => {
  const m = build({ './a': { browser: { default: './src/a.browser.ts' }, default: './src/a.ts' } }, [
    'browser',
    'default',
  ]);
  assert.deepEqual(m, { '^@x/pkg/a$': '<rootDir>/../pkg/src/a.browser.ts' });
});

test('どの条件にも一致しない subpath は握りつぶさず投げる', () => {
  // 黙って落とすと「メインチェックアウト側のソースで静かにテストが走る」縮退になる。
  assert.throws(() => build({ './a': { node: './src/a.node.ts' } }, ['browser']), /a/);
});

test('exports を持たない・文字列だけのパッケージは投げる', () => {
  assert.throws(() => build(undefined), /exports/);
  assert.throws(() => build('./src/index.ts'), /exports/);
});

test('ワイルドカードの * をキャプチャへ写す', () => {
  assert.deepEqual(build({ './*': './src/*.ts' }), { '^@x/pkg/(.*)$': '<rootDir>/../pkg/src/$1.ts' });
});

test('ワイルドカードの後ろにサフィックスがある形を保つ', () => {
  assert.deepEqual(build({ './*.js': './src/*.ts' }), { '^@x/pkg/(.*)\\.js$': '<rootDir>/../pkg/src/$1.ts' });
});

test('* が 2 つ以上ある宣言は静かに壊さず投げる', () => {
  assert.throws(() => build({ './*': './src/*/*.ts' }), /\*/);
  assert.throws(() => build({ './*/*': './src/*.ts' }), /\*/);
});

test('キーとターゲットで * の有無が食い違う宣言は投げる', () => {
  assert.throws(() => build({ './*': './src/index.ts' }), /\*/);
});

test('完全一致を先に、ワイルドカードは前置きが長い順に並べる', () => {
  // jest は moduleNameMapper を宣言順に評価して最初に一致したものを使うため、
  // 緩いパターンが先に来ると具体的なエントリが到達不能になる。
  const m = build({ './*': './src/*.ts', './src/*': './src/*', './a': './src/a.ts', '.': './src/index.ts' });
  assert.deepEqual(Object.keys(m), ['^@x/pkg$', '^@x/pkg/a$', '^@x/pkg/src/(.*)$', '^@x/pkg/(.*)$']);
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

test('listExportTargets は exports 不在を空で返す（検査側は全パッケージを走査するため）', () => {
  assert.deepEqual(listExportTargets(undefined), []);
  assert.deepEqual(listExportTargets('./src/index.ts'), []);
});

test('全ワークスペースの exports が実在するファイルを指す', () => {
  // dangling export（ソース削除後に exports エントリだけ残る）を CI で検知する。
  // ビルド成果物（dist / out）だけは未ビルド環境で存在しないため除外する。
  const workspaces = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).workspaces;
  const missing = [];
  for (const ws of workspaces) {
    const pkgPath = join(repoRoot, ws, 'package.json');
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    for (const target of listExportTargets(pkg.exports)) {
      if (/^\.\/(dist|out)\//.test(target)) continue;
      if (!existsSync(join(repoRoot, ws, target))) missing.push(`${pkg.name}: ${target}`);
    }
  }
  assert.deepEqual(missing, []);
});
