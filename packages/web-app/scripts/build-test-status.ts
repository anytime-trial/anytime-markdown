/**
 * テスト実施状況ページ（/test-status）のデータ生成スクリプト。
 *
 *   npm run data:test-status -w @anytime-markdown/web-app
 *   npm run data:test-status -w @anytime-markdown/web-app -- --repo /path/to/checkout
 *
 * 各パッケージで jest を --json 付きで実行し、CI での実行有無・直近 90 日の fix 件数・
 * カバレッジ目的テストの兆候と合わせて data/test-status/packages.json に書き出す。
 * 手段別の実施状況（data/test-status/means.json）は評価文書から人が保守し、ここでは触れない。
 *
 * Why not: ページの表示時に jest や git を動かさない。公開サイトのランタイムには
 * リポジトリもテストランナーも無いため、手元で実行した結果をスナップショットとして commit する。
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveGitExecutable } from '@anytime-markdown/trail-activity/gitExecutable';

import {
  countFixesByPackage,
  countSmells,
  findAbsolutePaths,
  isTestFile,
  parseCiTestPackages,
} from '../src/lib/testStatus/collect';
import type { PackageTestRow, TestRunResult, TestStatusSnapshot } from '../src/lib/testStatus/types';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
/**
 * 測る対象のチェックアウト。既定はこのスクリプトを含むリポジトリ。
 * worktree はパッケージ間の依存（他パッケージの dist 等）が揃わず偽の失敗が出るため、
 * worktree で作業するときは `-- --repo <main チェックアウト>` で依存の揃った側を測る。
 */
function resolveRepoRoot(argv: readonly string[]): string {
  const index = argv.indexOf('--repo');
  if (index === -1) return join(SCRIPT_DIR, '..', '..', '..');
  const value = argv[index + 1];
  if (!value) throw new Error('--repo にはリポジトリのパスを指定する');
  return resolve(value);
}

const REPO_ROOT = resolveRepoRoot(process.argv.slice(2));
const PACKAGES_DIR = join(REPO_ROOT, 'packages');
const OUTPUT_PATH = join(SCRIPT_DIR, '..', 'data', 'test-status', 'packages.json');
const JEST_BIN = join(REPO_ROOT, 'node_modules', 'jest', 'bin', 'jest.js');
const COVERAGE_ACTION = join(REPO_ROOT, '.github', 'actions', 'coverage-remaining', 'action.yml');
const CI_WORKFLOW = join(REPO_ROOT, '.github', 'workflows', 'ci.yml');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'out', 'build', '.next', 'coverage', '.worktrees', 'e2e', 'e2e-acceptance']);
const JEST_CONFIGS = ['jest.config.js', 'jest.config.cjs', 'jest.config.mjs', 'jest.config.ts'];
// 並列を上げると時間依存のテスト（mtime・タイムアウト）が偽の失敗を出す
const CONCURRENCY = 2;
const TIMEOUT_MS = 15 * 60 * 1000;

interface JestJson {
  numTotalTestSuites: number;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numRuntimeErrorTestSuites: number;
  numPendingTests: number;
  numTodoTests: number;
  success: boolean;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, acc);
    else acc.push(path);
  }
  return acc;
}

/** coverage-remaining と同じく、CI がこのフラグ付きで回すパッケージだけに付ける */
function coverageRemainingPackages(): Set<string> {
  return parseCiTestPackages('', readFileSync(COVERAGE_ACTION, 'utf8'));
}

function runJest(pkgDir: string, home: string, vmModules: boolean): Promise<{ result: JestJson | null; timedOut: boolean; durationSec: number }> {
  const outputFile = join(home, `jest-${basename(pkgDir)}.json`);
  // CI と同じ判定にそろえる。CI 変数が無いと手元専用の検査（graph-core のレイアウト時間予算等）が
  // 有効になり、CI では出ない失敗がページに載る
  // SEC-02: Windows の os.homedir() は USERPROFILE を、設定・データ領域は XDG_* を見るため HOME だけでは隔離しきれない
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(home, '.config'),
    XDG_DATA_HOME: join(home, '.local', 'share'),
    XDG_CACHE_HOME: join(home, '.cache'),
    CI: 'true',
  };
  if (vmModules) env.NODE_OPTIONS = '--experimental-vm-modules';
  return new Promise((resolve) => {
    const started = Date.now();
    // detached でプロセスグループを分け、時間切れのときに jest の worker ごと終わらせる
    const child = spawn(process.execPath, [JEST_BIN, '--json', `--outputFile=${outputFile}`, '--silent'], {
      cwd: pkgDir,
      env,
      stdio: 'ignore',
      detached: process.platform !== 'win32',
    });
    let timedOut = false;
    let settled = false;
    const finish = (result: JestJson | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ result, timedOut, durationSec: Math.round((Date.now() - started) / 100) / 10 });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, TIMEOUT_MS);
    child.on('error', (error) => {
      console.error(`[${new Date().toISOString()}] [ERROR] jest を起動できない: ${basename(pkgDir)}`, error.stack);
      finish(null);
    });
    child.on('exit', () => finish(readJestJson(outputFile, basename(pkgDir))));
  });
}

function killTree(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    if (process.platform === 'win32') process.kill(pid, 'SIGKILL');
    else process.kill(-pid, 'SIGKILL');
  } catch (error: unknown) {
    // 終了済みなら ESRCH になる。それ以外は記録して続ける（収集全体は止めない）
    console.error(`[${new Date().toISOString()}] [WARN] jest のプロセスを終了できない: pid=${pid}`, error instanceof Error ? error.message : error);
  }
}

/** jest が途中で落ちて JSON が壊れていても、そのパッケージを「起動失敗」にして収集を続ける */
function readJestJson(outputFile: string, name: string): JestJson | null {
  if (!existsSync(outputFile)) return null;
  try {
    return JSON.parse(readFileSync(outputFile, 'utf8')) as JestJson;
  } catch (error: unknown) {
    console.error(`[${new Date().toISOString()}] [ERROR] jest の結果を読めない: ${name}`, error instanceof Error ? error.message : error);
    return null;
  }
}

async function collectPackage(name: string, ctx: { ci: Set<string>; vm: Set<string>; fixes: Record<string, number>; home: string }): Promise<PackageTestRow> {
  const dir = join(PACKAGES_DIR, name);
  const files = walk(dir).map((path) => relative(dir, path));
  const testFiles = files.filter(isTestFile);
  const srcFiles = files.filter((p) => /^src\/.*\.tsx?$/.test(p) && !isTestFile(p) && !p.includes('__tests__'));
  const smells = countSmells(testFiles.map((p) => ({ name: basename(p), source: readFileSync(join(dir, p), 'utf8') })));
  const base = {
    package: name,
    srcFiles: srcFiles.length,
    testFiles: testFiles.length,
    inCI: ctx.ci.has(name),
    fixes90d: ctx.fixes[name] ?? 0,
    ...smells,
  };
  const empty = { suites: 0, tests: 0, passed: 0, failed: 0, skipped: 0, durationSec: 0 };
  if (testFiles.length === 0) return { ...base, ...empty, result: 'no-tests' };
  if (!JEST_CONFIGS.some((c) => existsSync(join(dir, c)))) return { ...base, ...empty, result: 'no-config' };

  const { result, timedOut, durationSec } = await runJest(dir, ctx.home, ctx.vm.has(name));
  if (!result) {
    const outcome: TestRunResult = timedOut ? 'timeout' : 'error';
    return { ...base, ...empty, durationSec, result: outcome };
  }
  return {
    ...base,
    suites: result.numTotalTestSuites,
    tests: result.numTotalTests,
    passed: result.numPassedTests,
    failed: result.numFailedTests + result.numRuntimeErrorTestSuites,
    skipped: result.numPendingTests + result.numTodoTests,
    durationSec,
    result: result.success ? 'pass' : 'fail',
  };
}

async function main(): Promise<void> {
  const ci = parseCiTestPackages(readFileSync(CI_WORKFLOW, 'utf8'), readFileSync(COVERAGE_ACTION, 'utf8'));
  const vm = coverageRemainingPackages();
  const fixes = countFixesByPackage(
    execFileSync(resolveGitExecutable(), ['-C', REPO_ROOT, 'log', '--since=90.days', '--pretty=%s'], { encoding: 'utf8' }),
  );
  // SEC-02: テストが本物の HOME（~/.claude 等の保護領域）へ書かないよう使い捨ての HOME で回す
  const home = mkdtempSync(join(tmpdir(), 'test-status-home-'));
  const names = readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(PACKAGES_DIR, e.name, 'package.json')))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
  const queue = [...names];
  const rows: PackageTestRow[] = [];
  try {
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        for (let name = queue.shift(); name; name = queue.shift()) {
          const row = await collectPackage(name, { ci, vm, fixes, home });
          rows.push(row);
          console.log(`[${new Date().toISOString()}] [INFO] ${name}: ${row.result} ${row.passed}/${row.tests} (${row.durationSec}s)`);
        }
      }),
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
  rows.sort((a, b) => a.package.localeCompare(b.package));
  const snapshot: TestStatusSnapshot = {
    commit: execFileSync(resolveGitExecutable(), ['-C', REPO_ROOT, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(),
    runAt: new Date().toISOString(),
    rows,
  };
  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
  // 正規表現は典型的な場所しか見ないため、この実行で実際に使ったパスの混入も直接照合する
  const leaked = [
    ...findAbsolutePaths(serialized),
    ...[REPO_ROOT, tmpdir(), home].filter((path) => serialized.includes(path)),
  ];
  if (leaked.length > 0) {
    throw new Error(`スナップショットに絶対パスが含まれるため書き出さない: ${leaked.slice(0, 3).join(', ')}`);
  }
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, serialized, 'utf8');
  console.log(`[${new Date().toISOString()}] [INFO] wrote ${rows.length} packages to ${relative(REPO_ROOT, OUTPUT_PATH)}`);
}

main().catch((error: unknown) => {
  console.error(`[${new Date().toISOString()}] [ERROR] build-test-status failed`, error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
