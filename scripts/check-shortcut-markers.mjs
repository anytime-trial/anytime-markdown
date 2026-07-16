#!/usr/bin/env node
// check-shortcut-markers.mjs — SHORTCUT 意図的簡略化マーカーの CI ゲート。
// 規約(~/.claude/rules/code-quality.md 2.1)の 3 要素(<内容>. ceiling: ... upgrade: ...)を検査し、
// ceiling / upgrade 欠落(no-trigger 含む)を検出したら exit 1 でブロックする。
// dev-retro grounding の台帳(観測・デルタ追跡)と対になるゲート側。判定ロジックは
// anytime-dev-retro スキルの shortcutMarkers.cjs に一本化し意味ズレを防ぐ。
// 参照するのは git 正本(packages/vscode-trail-extension/skills/)であって
// .claude/skills/ の実行時コピーではない。後者は .gitignore 済みで CI に存在しない。
//
// 使い方: node scripts/check-shortcut-markers.mjs [rootDir]
//   rootDir 省略時はリポジトリルート。終了コード: 欠落検出時のみ 1。
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const { collectShortcutMarkers, MARKER_NEEDLE } = require(
  join(
    repoRoot,
    'packages',
    'vscode-trail-extension',
    'skills',
    'anytime-dev-retro',
    'shortcutMarkers.cjs',
  ),
);

// 走査対象・除外は grounding.cjs の techDebt 走査と同一基準(台帳とゲートの母集団を揃える)。
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'out', 'build', '.git', '.anytime',
  '.next', 'coverage', '.worktrees', '.vscode-test',
]);
const EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs']);

/** テキスト中の 3 要素欠落マーカーを列挙する(純粋関数)。 */
export function findViolations(text) {
  return collectShortcutMarkers(text)
    .filter((m) => !m.hasCeiling || !m.hasUpgrade)
    .map((m) => ({
      line: m.line,
      missing: [...(m.hasCeiling ? [] : ['ceiling']), ...(m.hasUpgrade ? [] : ['upgrade'])],
    }));
}

/** ルート配下のコードファイルを走査し violation を集める。走査順は名前順で決定的。 */
export function scanShortcutDir(root) {
  const violations = [];
  let filesScanned = 0;
  const walk = (dir) => {
    const entries = readdirSync(dir, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const ent of entries) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (!SKIP_DIRS.has(ent.name)) walk(full);
        continue;
      }
      if (!ent.isFile() || !EXT.has(extname(ent.name))) continue;
      filesScanned++;
      const text = readFileSync(full, 'utf-8');
      if (!text.includes(MARKER_NEEDLE)) continue;
      for (const v of findViolations(text)) {
        violations.push({ file: relative(root, full), line: v.line, missing: v.missing });
      }
    }
  };
  walk(root);
  return { violations, filesScanned };
}

function main() {
  const root = process.argv[2] ?? repoRoot;
  const { violations, filesScanned } = scanShortcutDir(root);
  console.log(`[check-shortcut-markers] ${filesScanned} ファイルを検査 (${root})`);
  for (const v of violations) {
    console.error(`  ✗ ${v.file}:${v.line} 欠落: ${v.missing.join(', ')} (規約 code-quality.md 2.1: 3 要素必須)`);
  }
  if (violations.length > 0) process.exit(1);
  console.log('[check-shortcut-markers] OK: 3 要素欠落なし');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
