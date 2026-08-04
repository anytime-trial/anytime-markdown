#!/usr/bin/env node
// check-test-collection.mjs — 「テストファイルが存在するのに、どの jest 設定にも収集されていない」
// 状態を検出する CI ゲート。
//
// 背景: jest の収集漏れは「テストが落ちる」ではなく「スイートがそもそも起動しない」形で
// 現れる。総数が減るだけなのでサマリを眺めても気づけない。実例として trail-viewer の
// testMatch が `*.test.ts` だけを見ており、`*.test.tsx` が 1 件も収集されていなかった
// （`useC4GhostEdges.test.tsx` は追加以来一度も実行されていなかった）。
//
// 収集判定は自前でグロブを再実装せず `jest --listTests` に委ねる。パターンの解釈を
// 二重実装すると、ゲートと本番の収集条件が静かにずれる。
//
// 使い方: node scripts/check-test-collection.mjs [repoRoot]
//   終了コード: 収集漏れ検出時のみ 1。
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** テストとみなすファイル名。jest 既定（`*.test.*` / `*.spec.*`）に合わせる。 */
const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx|js|jsx|cjs|mjs)$/;

/** 走査対象から外すディレクトリ名（生成物・依存・別チェックアウト）。 */
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'out', 'build', '.next', 'coverage', '.worktrees', '.git',
]);

const JEST_CONFIG_NAMES = ['jest.config.js', 'jest.config.cjs', 'jest.config.mjs'];

/**
 * jest 以外のランナーが動かすテスト。**除外理由を必ず添える**（理由を書けない除外は
 * 収集漏れの隠蔽と区別できない）。
 */
export const ALLOWLIST = [
  {
    prefix: 'packages/web-app/e2e/',
    reason: 'Playwright E2E（playwright.config.ts が収集する）',
  },
  {
    prefix: 'packages/web-app/e2e-acceptance/',
    reason: 'Playwright 受け入れ試験',
  },
  {
    prefix: 'packages/vscode-markdown-extension/src/test/',
    reason: '@vscode/test-electron 上の mocha 統合テスト（vscode モジュールを import する）',
  },
];

/** 除外対象か。前方一致で判定する。 */
export function isAllowlisted(path, allowlist = ALLOWLIST) {
  return allowlist.some((entry) => path.startsWith(entry.prefix));
}

/**
 * 収集漏れを選ぶ純粋関数。
 *
 * @param {readonly string[]} actual   リポジトリ内に実在するテストファイル（repo 相対）
 * @param {readonly string[]} listed   jest が収集したテストファイル（repo 相対）
 * @param {readonly {prefix: string, reason: string}[]} allowlist 別ランナー担当分
 * @returns {string[]} 収集されておらず allowlist にも無いもの（昇順）
 */
export function selectUncollected(actual, listed, allowlist = ALLOWLIST) {
  const collected = new Set(listed);
  return actual
    .filter((path) => !collected.has(path))
    .filter((path) => !isAllowlisted(path, allowlist))
    .sort((a, b) => a.localeCompare(b));
}

/** ディレクトリを再帰的に走査してテストファイルを集める。 */
export function collectTestFiles(dir, repoRoot, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectTestFiles(join(dir, entry.name), repoRoot, acc);
      continue;
    }
    if (TEST_FILE_RE.test(entry.name)) acc.push(relative(repoRoot, join(dir, entry.name)));
  }
  return acc;
}

/** `packages/` 直下のパッケージを返す。**jest 設定の有無で絞らない。** */
export function findPackageDirs(repoRoot) {
  const packagesDir = join(repoRoot, 'packages');
  if (!existsSync(packagesDir)) return [];
  return readdirSync(packagesDir)
    .sort()
    .map((name) => join(packagesDir, name))
    .filter((dir) => statSync(dir).isDirectory());
}

/**
 * jest 設定を持つパッケージのディレクトリと設定ファイルを返す。
 *
 * 走査対象の母集合には使わない。設定を持たないパッケージのテストこそ
 * 「どの設定にも収集されない」状態そのものであり、ここで絞ると検出できなくなる。
 */
export function findJestPackages(repoRoot) {
  const found = [];
  for (const pkgDir of findPackageDirs(repoRoot)) {
    const configName = JEST_CONFIG_NAMES.find((c) => existsSync(join(pkgDir, c)));
    if (!configName) continue;
    found.push({ pkgDir, configPath: join(pkgDir, configName) });
  }
  return found;
}

/** `jest --listTests` の出力を repo 相対パスの配列へ正規化する。 */
export function parseListTestsOutput(stdout, repoRoot) {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('/'))
    .map((line) => relative(repoRoot, line));
}

function listCollected(configPath, repoRoot) {
  // --listTests は収集だけを行い、テストは実行しない。
  const stdout = execFileSync('npx', ['jest', '-c', configPath, '--listTests'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
  });
  return parseListTestsOutput(stdout, repoRoot);
}

function main() {
  const repoRoot = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..');
  const packageDirs = findPackageDirs(repoRoot);
  const jestPackages = findJestPackages(repoRoot);
  if (jestPackages.length === 0) {
    console.error('[check-test-collection] jest 設定を持つパッケージが 1 つも見つからない');
    process.exit(1);
  }

  // 実在するテストは packages 全体から集める。jest 設定を持つパッケージだけを見ると、
  // 設定ごと無いパッケージのテスト（まさに収集されない状態）が対象外になって素通りする。
  const actual = packageDirs.flatMap((dir) => collectTestFiles(dir, repoRoot));

  // 収集済み集合は全設定の合算。ある設定の rootDir が別パッケージを含む構成でも取りこぼさない。
  const collected = [];
  const failures = [];
  for (const { configPath } of jestPackages) {
    try {
      collected.push(...listCollected(configPath, repoRoot));
    } catch (err) {
      // 収集自体が失敗したら「漏れ 0 件」と同じ扱いにしない（silent な緑を作らない）。
      failures.push({ configPath: relative(repoRoot, configPath), message: String(err).slice(0, 300) });
    }
  }

  const problems = selectUncollected(actual, collected);

  for (const f of failures) {
    console.error(`[check-test-collection] 収集に失敗: ${f.configPath}\n  ${f.message}`);
  }
  if (problems.length > 0) {
    console.error('[check-test-collection] どの jest 設定にも収集されないテストファイル:');
    for (const path of problems) console.error(`  ${path}`);
    console.error(
      '\n収集漏れは「失敗」ではなく「実行されない」形で沈黙する。\n' +
        '当該パッケージの testMatch を直すか、別ランナーが動かすものなら\n' +
        'scripts/check-test-collection.mjs の ALLOWLIST へ理由付きで追加すること。',
    );
  }
  if (problems.length > 0 || failures.length > 0) process.exit(1);
  console.log(
    `[check-test-collection] OK — ${packageDirs.length} パッケージ / テスト ${actual.length} 件に収集漏れなし` +
      `（jest 設定 ${jestPackages.length} 件）`,
  );
}

if (process.argv[1] && process.argv[1].endsWith('check-test-collection.mjs')) main();
