#!/usr/bin/env node
// check-bare-git-exec.mjs — `git` をコマンド名のまま child_process へ渡す箇所を検出する CI ゲート。
//
// Why: コマンド名だけを渡すと探索が OS 任せになる。Windows の CreateProcess はカレント
// ディレクトリを PATH より先に探すため、信頼できないリポジトリを cwd にして git を起動すると、
// そのリポジトリにコミットされた git.exe が実行され得る（SonarCloud S4036）。
// 本番コードは trail-core の `resolveGitExecutable()` で絶対パスへ解決してから exec すること。
//
// Why このゲートが要るか: 移行漏れは「エラー」ではなく「従来どおり動く」形で残るため、
// テストもビルドも緑のまま素通りする。実際に初回移行で 5 箇所を取りこぼした（非同期の
// promisify 版 `execFileAsync('git', ...)` / `execFileP('git', ...)` が grep から漏れた）。
//
// 使い方: node scripts/check-bare-git-exec.mjs [rootDir]
//   終了コード: 違反検出時のみ 1。
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'out', 'build', '.git', '.anytime',
  '.next', 'coverage', '.worktrees', '.vscode-test',
]);
const EXT = new Set(['.ts', '.tsx']);

/**
 * 検査対象は `packages/*` の本番ソースのみ。
 *
 * - テスト（`__tests__` / `*.test.*`）は使い捨ての一時リポジトリを自前で作って操作するだけで、
 *   信頼できないリポジトリを cwd にしない。
 * - `scripts/` は開発者が自分のリポジトリで手動実行するもので、配布物ではない。
 * - 拡張に同梱されて**ユーザーのワークスペースへ素で展開される** `.cjs` スキルスクリプトは
 *   trail-core を import できないため本ゲートの対象外。別途の対処が要る（未対応）。
 */
function isTargetFile(relPath) {
  if (!relPath.startsWith('packages/')) return false;
  if (!EXT.has(extname(relPath))) return false;
  if (relPath.includes('__tests__/')) return false;
  if (/\.(test|spec)\.tsx?$/.test(relPath)) return false;
  // 解決ユーティリティ本体は説明コメントで 'git' に言及する。
  if (relPath.endsWith('packages/trail-core/src/gitExecutable.ts')) return false;
  return true;
}

/** exec/spawn 系の第 1 引数がリテラル 'git' の行を列挙する（純粋関数）。 */
export function findViolations(text) {
  const pattern = /\b(?:exec|spawn)[A-Za-z]*\s*\(\s*(['"])git\1/;
  const violations = [];
  text.split('\n').forEach((line, index) => {
    if (pattern.test(line)) violations.push({ line: index + 1, text: line.trim() });
  });
  return violations;
}

export function scanRepo(root) {
  const violations = [];
  let filesScanned = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(join(dir, entry.name));
        continue;
      }
      const full = join(dir, entry.name);
      const rel = relative(root, full).replaceAll('\\', '/');
      if (!isTargetFile(rel)) continue;
      filesScanned += 1;
      for (const v of findViolations(readFileSync(full, 'utf8'))) {
        violations.push({ file: rel, ...v });
      }
    }
  };
  walk(root);
  return { violations, filesScanned };
}

function main() {
  const root = process.argv[2] ?? repoRoot;
  const { violations, filesScanned } = scanRepo(root);
  console.log(`[check-bare-git-exec] ${filesScanned} ファイルを検査 (${root})`);
  for (const v of violations) {
    console.error(`  ✗ ${v.file}:${v.line} bare 'git' を exec している: ${v.text}`);
  }
  if (violations.length > 0) {
    console.error(
      "  → @anytime-markdown/trail-core/gitExecutable の resolveGitExecutable() で絶対パスへ解決してから渡すこと",
    );
    process.exit(1);
  }
  console.log('[check-bare-git-exec] OK: bare git 実行なし');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
