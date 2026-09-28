#!/usr/bin/env tsx
// <docsRoot> など mcp-markdown のルート外にある Markdown を、MCP の `format_markdown` と
// 同じ規則（markdown-engine の formatMarkdown）と同じ書込ガード（section-lock-core）で
// 整形・検査する CLI。
//
// mcp-markdown は起動時の cwd（Claude Code の `.mcp.json` 経路では /anytime-markdown）を
// ルートとし、ルート外のパスには `Access denied` を返す。設計書・提案・レポート・レビューの
// 出力先 <docsRoot> はルート外なので、機械整形はこの CLI で行う
// （anytime-markdown-output スキル §10.1）。
//
// 書込前の Section Lock 検査は mcp-markdown の `assertNoLockViolation` と同じ判定
// （前後比較 evaluateLockChange）を行う。<docsRoot> は PreToolUse フックの効かない経路なので、
// ここで検査しないとロック節（人間が管理する節）を無警告で上書きしてしまう。
//
// import はワークスペース名でなくリポジトリ相対にする（gen-spec-index.mjs と同じ理由。
// worktree では node_modules の symlink が main チェックアウト側へ解決される）。
//
// 使い方: tsx scripts/format-docs.mjs [--check] <path>... （ディレクトリは *.md を再帰）
//   --check: 書き込まず、変更の有無・適用規則・警告だけを報告する。変更ありなら exit 1
//   既定（fix）: 変更があるファイルだけ上書きする。フロントマターとコードフェンスは触らない。
//   ロック節に触れる変更は書き込まずに報告し exit 1（他のファイルは処理を続ける）

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { formatMarkdown } from '../packages/markdown-engine/src/formatMarkdown.ts';
import { evaluateLockChange, hasLockedSections } from '../packages/section-lock-core/src/index.ts';

export function collectMarkdownFiles(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  const files = [];
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) files.push(...collectMarkdownFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(full);
  }
  return files.sort();
}

function summarizeRules(rulesApplied) {
  return Object.entries(rulesApplied)
    .filter(([, count]) => count > 0)
    .map(([rule, count]) => `${rule}=${count}`)
    .join(' ');
}

/**
 * before → after の変更がロック節に違反していれば違反の説明文を返す（無ければ null）。
 * tamper（ロック外経路の逸脱）は書込を止めず警告だけ返す（mcp-markdown と同方針）。
 */
export function describeLockViolation(before, after) {
  if (!hasLockedSections(before)) return { violation: null, tampers: [] };
  const { violations, tampers } = evaluateLockChange(before, after);
  if (violations.length === 0) return { violation: null, tampers };
  const details = violations.map((v) => `${v.kind}: ${v.entry.path}(${v.entry.occurrence})`).join('; ');
  return { violation: details, tampers };
}

/**
 * 1 ファイルを整形（check なら検査のみ）し、結果を返す。書き込みは
 * fix モードで変更があり、かつロック違反が無い場合だけ行う。
 */
export function formatOneFile(file, { check }) {
  const source = fs.readFileSync(file, 'utf8');
  const { result, rulesApplied, warnings } = formatMarkdown(source);
  const changed = result !== source;
  let status = changed ? (check ? 'needs-format' : 'formatted') : 'ok';
  let lockViolation = null;
  let tampers = [];
  if (changed) {
    ({ violation: lockViolation, tampers } = describeLockViolation(source, result));
    if (lockViolation) status = 'lock-violation';
    else if (!check) fs.writeFileSync(file, result, 'utf8');
  }
  return { file, status, changed, rulesApplied, warnings, lockViolation, tampers };
}

export function formatDocs(targets, { check = false, log = console.log, error = console.error } = {}) {
  let changedCount = 0;
  let warningCount = 0;
  let violationCount = 0;
  for (const target of targets) {
    const resolved = path.resolve(target);
    if (!fs.existsSync(resolved)) {
      error(`[format-docs] not found: ${resolved}`);
      return { exitCode: 2, changedCount, warningCount, violationCount };
    }
    for (const file of collectMarkdownFiles(resolved)) {
      const r = formatOneFile(file, { check });
      if (r.changed) changedCount += 1;
      warningCount += r.warnings.length;
      const rules = summarizeRules(r.rulesApplied);
      log(`[format-docs] ${r.status} ${file}${rules ? ` (${rules})` : ''}`);
      for (const t of tampersOf(r)) log(`  warn section-lock tamper: ${t}`);
      if (r.lockViolation) {
        violationCount += 1;
        error(
          `  error section-lock: ${r.lockViolation}. ` +
            'Locked sections are managed by humans; unlock them in the Anytime Markdown editor first.',
        );
      }
      for (const w of r.warnings) log(`  warn L${w.line} ${w.rule}: ${w.msg}`);
    }
  }
  log(
    `[format-docs] ${check ? 'needs-format' : 'formatted'}: ${changedCount - violationCount}, ` +
      `lock-violations: ${violationCount}, warnings: ${warningCount}`,
  );
  const exitCode = violationCount > 0 || (check && changedCount > 0) ? 1 : 0;
  return { exitCode, changedCount, warningCount, violationCount };
}

function tampersOf(r) {
  return r.tampers.map((t) => `${t.path}(${t.occurrence})`);
}

export function main(argv = process.argv.slice(2)) {
  const check = argv.includes('--check');
  const targets = argv.filter((a) => a !== '--check');
  if (targets.length === 0) {
    console.error('usage: tsx scripts/format-docs.mjs [--check] <path>...');
    return 2;
  }
  return formatDocs(targets, { check }).exitCode;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
