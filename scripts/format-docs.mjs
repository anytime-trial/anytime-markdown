#!/usr/bin/env tsx
// <docsRoot> など mcp-markdown のルート外にある Markdown を、MCP の `format_markdown` と
// 同じ規則（markdown-engine の formatMarkdown）で整形・検査する CLI。
//
// mcp-markdown は起動時の cwd（Claude Code の `.mcp.json` 経路では /anytime-markdown）を
// ルートとし、ルート外のパスには `Access denied` を返す。設計書・提案・レポート・レビューの
// 出力先 <docsRoot> はルート外なので、機械整形はこの CLI で行う
// （anytime-markdown-output スキル §10.1）。
//
// import はワークスペース名でなくリポジトリ相対にする（gen-spec-index.mjs と同じ理由。
// worktree では node_modules の symlink が main チェックアウト側へ解決される）。
//
// 使い方: tsx scripts/format-docs.mjs [--check] <path>... （ディレクトリは *.md を再帰）
//   --check: 書き込まず、変更の有無・適用規則・警告だけを報告する。変更ありなら exit 1
//   既定（fix）: 変更があるファイルだけ上書きする。フロントマターとコードフェンスは触らない

import fs from 'node:fs';
import path from 'node:path';
import { formatMarkdown } from '../packages/markdown-engine/src/formatMarkdown.ts';

function collectMarkdownFiles(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  const files = [];
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) files.push(...collectMarkdownFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(full);
  }
  return files;
}

function summarizeRules(rulesApplied) {
  return Object.entries(rulesApplied)
    .filter(([, count]) => count > 0)
    .map(([rule, count]) => `${rule}=${count}`)
    .join(' ');
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const targets = args.filter((a) => a !== '--check');
  if (targets.length === 0) {
    console.error('usage: tsx scripts/format-docs.mjs [--check] <path>...');
    process.exit(2);
  }

  let changedCount = 0;
  let warningCount = 0;
  for (const target of targets) {
    const resolved = path.resolve(target);
    if (!fs.existsSync(resolved)) {
      console.error(`[format-docs] not found: ${resolved}`);
      process.exit(2);
    }
    for (const file of collectMarkdownFiles(resolved)) {
      const source = fs.readFileSync(file, 'utf8');
      const { result, rulesApplied, warnings } = formatMarkdown(source);
      const changed = result !== source;
      if (changed) changedCount += 1;
      warningCount += warnings.length;
      if (changed && !check) fs.writeFileSync(file, result, 'utf8');

      const status = changed ? (check ? 'needs-format' : 'formatted') : 'ok';
      const rules = summarizeRules(rulesApplied);
      console.log(`[format-docs] ${status} ${file}${rules ? ` (${rules})` : ''}`);
      for (const w of warnings) console.log(`  warn L${w.line} ${w.rule}: ${w.msg}`);
    }
  }

  console.log(`[format-docs] ${check ? 'needs-format' : 'formatted'}: ${changedCount}, warnings: ${warningCount}`);
  if (check && changedCount > 0) process.exit(1);
}

main();
