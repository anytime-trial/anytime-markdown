#!/usr/bin/env node
'use strict';

/**
 * 実装済みの自動テストを列挙し、テスト仕様書の素材（JSON）を標準出力へ書く。
 *
 * AI にテストファイルを読み回らせると件数の取りこぼしが起きるため、列挙だけは機械で行う。
 * 「何を確かめているか」の要約はスキル本文の手順で AI が書く。本スクリプトは読み取り専用で、
 * ファイルを書き換えない。
 *
 * 使い方:
 *   node collect-tests.cjs [--root <dir>] [--since <git-rev>] [--previous <spec.md>] <path>...
 *
 * 解析は行単位の正規表現による近似である（AST を使わない）。Why not AST: 同梱スクリプトは
 * 配布先ワークスペースで node 単体実行され、typescript 等の依存を前提にできない。
 * describe の入れ子はインデントで判定するため、整形済み（Prettier 等）のコードを前提とする。
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const TEST_FILE_PATTERN = /\.(test|spec)\.[cm]?[jt]sx?$/;
const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'out', 'build', 'coverage', '.next', '.git', '.worktrees']);

// describe / it / test と修飾子（.skip / .only / .todo / .fixme / .describe / 1 行の .each(...) 等）の後に
// 文字列リテラルのタイトルが続く呼び出し。
const CALL_PATTERN =
  /^(\s*)(describe|it|test)((?:\.(?:describe|skip|only|todo|fixme|concurrent|serial|parallel|failing))*)(?:\.each\s*\(.*?\)\s*)?\s*\(\s*(['"`])((?:\\.|(?!\4).)*)\4/;
// タイトルが開始行に無い .each の開始行（テーブルが複数行・タイトルが次の行など）
const EACH_START_PATTERN =
  /^(\s*)(describe|it|test)((?:\.(?:describe|skip|only|todo|fixme|concurrent|serial|parallel|failing))*)\.each\s*[(`]/;
// .each のテーブルを閉じた直後の `(` とタイトル（`])('t'` / `] as const)(\n 't'` / `\`('t'`）。改行をまたいで探す
const EACH_TITLE_PATTERN = /(?:(?:\]\s*(?:as\s+const\s*)?)?\)|`)\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
// テスト本体の中で実行時に skip する呼び出し（`test.skip(!cond, 'reason')`）。コールバックを持つ定義とは区別する
const RUNTIME_SKIP_PATTERN = /^\s*test\.(?:skip|fixme|fail)\s*\(/;
const CALLBACK_PATTERN = /=>|\bfunction\b/;
// 行頭の describe / it / test 呼び出し。タイトルを拾えなかったものを unparsed に出し、列挙漏れを件数とは
// 別の経路で知らせる（件数照合はスクリプト自身の数え方に依存し、漏れを検知できない）
const CALL_START_PATTERN = /^\s*(describe|it|test)(?:\.\w+)*\s*[(`]/;
// テストを定義しないフック・設定の呼び出し（Playwright の test.beforeEach / test.describe.configure 等）は除く
const NON_TEST_CALL_PATTERN =
  /^\s*(?:describe|test)(?:\.describe)?\.(?:beforeEach|afterEach|beforeAll|afterAll|configure|use|step|setTimeout|slow|info|extend|expect)\b/;
const EACH_CLOSE_SEARCH_LINES = 200;
const ASSERTION_PATTERN = /\bexpect(?:\.\w+)?\s*\(|\bassert(?:\.\w+)?\s*\(|\bexpectTypeOf\s*\(/;
const FLAG_NAMES = ['skip', 'only', 'todo', 'fixme', 'failing'];

/** パスから e2e / unit を推定する。integration の判別は呼び出し側（AI）がテスト内容から行う。 */
function inferKind(relPath) {
  return /(^|\/)(e2e|e2e-[\w-]+|playwright)(\/|$)/.test(relPath) ? 'e2e' : 'unit';
}

function modifierFlags(modifiers) {
  return modifiers
    .split('.')
    .filter((m) => FLAG_NAMES.includes(m));
}

function toCall(line, indent, fn, modifiers, title) {
  const isDescribe = fn === 'describe' || modifiers.split('.').includes('describe');
  return { line, indent: indent.length, isDescribe, title, flags: modifierFlags(modifiers) };
}

/**
 * 行 start で始まる .each のタイトルを、テーブルを閉じた後ろから探す。
 * [タイトルのある行番号(0 始まり), タイトル] を返し、見つからなければ null。
 */
function findEachTitle(lines, start) {
  const joined = lines.slice(start, start + EACH_CLOSE_SEARCH_LINES).join('\n');
  // テーブルの開き（`.each(` / `.each\``）の後ろから探す。開きの `(` をタイトル直前の `(` と取り違えない
  const opener = /\.each\s*[(`]/.exec(joined);
  if (!opener) return null;
  EACH_TITLE_PATTERN.lastIndex = opener.index + opener[0].length;
  const m = EACH_TITLE_PATTERN.exec(joined);
  if (!m) return null;
  const titleLine = start + joined.slice(0, m.index + m[0].length).split('\n').length - 1;
  return [titleLine, m[2]];
}

/** 行ごとに describe / it / test の呼び出しを拾い、拾えなかった呼び出しを unparsed に分ける。 */
function scanCalls(lines, relPath) {
  const calls = [];
  const unparsed = [];
  const runtimeSkipLines = [];
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    const m = CALL_PATTERN.exec(text);
    if (m) {
      calls.push(toCall(i + 1, m[1], m[2], m[3], m[5]));
      continue;
    }
    const each = EACH_START_PATTERN.exec(text);
    const title = each ? findEachTitle(lines, i) : null;
    if (each && title) {
      calls.push(toCall(i + 1, each[1], each[2], each[3], title[1]));
      i = title[0];
      continue;
    }
    if (RUNTIME_SKIP_PATTERN.test(text) && !CALLBACK_PATTERN.test(text)) {
      runtimeSkipLines.push(i + 1);
      continue;
    }
    if (CALL_START_PATTERN.test(text) && !NON_TEST_CALL_PATTERN.test(text)) {
      unparsed.push({ file: relPath, line: i + 1, text: text.trim() });
    }
  }
  return { calls, unparsed, runtimeSkipLines };
}

/**
 * 1 ファイル分のソースからテストを列挙する（純関数）。
 * 返す各テストは key（path::タイトルパス）・行範囲・フラグ・アサーション数を持つ。
 * タイトルを拾えなかった呼び出しは unparsed に入る（仕様書を書く側が手で補う）。
 */
function scanTestFile(source, relPath) {
  const lines = source.split(/\r?\n/);
  const { calls, unparsed, runtimeSkipLines } = scanCalls(lines, relPath);

  const tests = [];
  const stack = [];
  const seen = new Map();
  calls.forEach((call, i) => {
    while (stack.length > 0 && stack[stack.length - 1].indent >= call.indent) stack.pop();
    if (call.isDescribe) {
      stack.push(call);
      return;
    }
    // テストの範囲は次の describe / it / test の直前まで（近似）
    const endLine = i + 1 < calls.length ? calls[i + 1].line - 1 : lines.length;
    const body = lines.slice(call.line - 1, endLine);
    const inherited = stack.flatMap((d) => d.flags);
    const runtimeSkip = runtimeSkipLines.some((l) => l > call.line && l <= endLine) ? ['conditional-skip'] : [];
    const flags = [...new Set([...inherited, ...call.flags, ...runtimeSkip])];
    const titlePath = [...stack.map((d) => d.title), call.title];
    const baseKey = `${relPath}::${titlePath.join(' > ')}`;
    const count = (seen.get(baseKey) ?? 0) + 1;
    seen.set(baseKey, count);
    tests.push({
      key: count === 1 ? baseKey : `${baseKey} #${count}`,
      file: relPath,
      line: call.line,
      endLine,
      titlePath,
      title: call.title,
      kind: inferKind(relPath),
      flags,
      assertions: body.filter((l) => ASSERTION_PATTERN.test(l)).length,
    });
  });
  return { tests, unparsed };
}

function parseTestFile(source, relPath) {
  return scanTestFile(source, relPath).tests;
}

/** `git diff -U0` の出力から、新しい側で変わった行範囲 [start, end] を返す（純関数）。 */
function changedLineRanges(diffText) {
  const ranges = [];
  for (const m of diffText.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    // 削除のみの hunk（count 0）は start 行と次の行の間で消えている。どちらに属するテストかは
    // 行番号だけでは決まらないため、両方を変更扱いにする（レビュー漏れより過検出を選ぶ）
    ranges.push(count === 0 ? [start, start + 1] : [start, start + count - 1]);
  }
  return ranges;
}

function markChanged(tests, ranges) {
  return tests.map((t) => ({
    ...t,
    changed: ranges.some(([s, e]) => s <= t.endLine && e >= t.line),
  }));
}

/** 既存のテスト仕様書から、テストキー（バッククォート内の `path::title`）を出現順に集める。 */
function extractSpecKeys(markdown) {
  return [...markdown.matchAll(/`([^`\n]+?::[^`\n]+)`/g)].map((m) => m[1]);
}

function diffKeys(previousKeys, currentKeys) {
  const prev = new Set(previousKeys);
  const curr = new Set(currentKeys);
  return {
    added: currentKeys.filter((k) => !prev.has(k)),
    removed: previousKeys.filter((k) => !curr.has(k)),
    kept: currentKeys.filter((k) => prev.has(k)),
  };
}

function walk(absPath, out) {
  const stat = fs.statSync(absPath);
  if (stat.isFile()) {
    if (TEST_FILE_PATTERN.test(absPath)) out.push(absPath);
    return;
  }
  for (const entry of fs.readdirSync(absPath, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
    walk(path.join(absPath, entry.name), out);
  }
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function git(root, args) {
  // stderr は握って呼び出し側で判定する（cat-file -e の「無い」は正常系の分岐）
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: 'pipe' });
}

/** since 以降に変わった行範囲を付ける。since 時点に無かったファイルは全テストを changed にする。 */
function applySince(root, relPath, tests, since) {
  const existed = (() => {
    try {
      // `rev:path` はリポジトリルート基準。root がサブディレクトリでも通るよう cwd 基準の ./ を付ける
      git(root, ['cat-file', '-e', `${since}:./${relPath}`]);
      return true;
    } catch {
      return false;
    }
  })();
  if (!existed) return tests.map((t) => ({ ...t, changed: true }));
  return markChanged(tests, changedLineRanges(git(root, ['diff', '-U0', since, '--', relPath])));
}

function summarize(tests, fileCount, unparsedCount) {
  const byKind = {};
  for (const t of tests) byKind[t.kind] = (byKind[t.kind] ?? 0) + 1;
  const withFlag = (f) => tests.filter((t) => t.flags.includes(f)).length;
  return {
    files: fileCount,
    tests: tests.length,
    byKind,
    skip: withFlag('skip') + withFlag('fixme'),
    conditionalSkip: withFlag('conditional-skip'),
    only: withFlag('only'),
    todo: withFlag('todo'),
    noAssertion: tests.filter((t) => t.assertions === 0 && !t.flags.includes('todo')).length,
    unparsed: unparsedCount,
  };
}

function collect({ root, paths, since, previous }) {
  const absRoot = path.resolve(root);
  const files = [];
  for (const p of paths) walk(path.resolve(absRoot, p), files);
  files.sort();

  let tests = [];
  let unparsed = [];
  for (const abs of files) {
    const relPath = toPosix(path.relative(absRoot, abs));
    const scanned = scanTestFile(fs.readFileSync(abs, 'utf8'), relPath);
    tests = tests.concat(since ? applySince(absRoot, relPath, scanned.tests, since) : scanned.tests);
    unparsed = unparsed.concat(scanned.unparsed);
  }

  const result = {
    root: toPosix(absRoot),
    since: since ?? null,
    summary: summarize(tests, files.length, unparsed.length),
    tests,
    unparsed,
  };
  if (previous) {
    result.diff = diffKeys(extractSpecKeys(fs.readFileSync(previous, 'utf8')), tests.map((t) => t.key));
  }
  return result;
}

function parseArgs(argv) {
  const opts = { root: process.cwd(), paths: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') opts.root = argv[++i];
    else if (a === '--since') opts.since = argv[++i];
    else if (a === '--previous') opts.previous = argv[++i];
    else opts.paths.push(a);
  }
  if (opts.paths.length === 0) opts.paths.push('.');
  return opts;
}

if (require.main === module) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.since) opts.head = git(path.resolve(opts.root), ['rev-parse', 'HEAD']).trim();
    const result = collect(opts);
    if (opts.head) result.head = opts.head;
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (err) {
    process.stderr.write(`[collect-tests] ${err && err.stack ? err.stack : String(err)}\n`);
    process.exit(1);
  }
}

module.exports = {
  scanTestFile,
  parseTestFile,
  changedLineRanges,
  markChanged,
  extractSpecKeys,
  diffKeys,
  collect,
  parseArgs,
};
