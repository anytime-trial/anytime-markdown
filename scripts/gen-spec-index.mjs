#!/usr/bin/env node
// 設計書（spec）の frontmatter から索引（00-index.ja.md）を生成する。
//
// 目的: 人と Claude が「索引 → 対象 frontmatter → 型付き related を辿る」決定論的
// ナビゲーションの入口を持てるようにする（progressive disclosure・低トークン）。
//
// 仕組み: 指定ディレクトリ配下の .md を walk し、gray-matter で frontmatter を解析。
// `graph: false` は除外。title / category / excerpt / related（型付き）を抽出し、
// トップレベル番号ディレクトリ単位でグルーピングした索引 markdown を出力する。
// related は型付き（{ to, type }）/ 素の文字列（= references）の両方を正規化する。
//
// 使い方: node scripts/gen-spec-index.mjs [docDir] [outFile] [title] [scopeName]
//   docDir 既定: /Shared/anytime-markdown-docs/spec
//   outFile 既定: <docDir>/00-index.ja.md
//   title 既定: 設計書 索引（自動生成） / scopeName 既定: spec（excerpt の「<scopeName> 配下」に使う）

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const matter = require('gray-matter');

const RELATION_TYPES = ['references', 'depends-on', 'implements', 'part-of', 'supersedes', 'refines'];
const DEFAULT_RELATION_TYPE = 'references';
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out', 'build', '.next', '.claude']);
const GRAPH_FALSE = new Set(['false', 'no', 'off', '0']);

function coerceType(value) {
  if (typeof value === 'string' && RELATION_TYPES.includes(value)) return value;
  return DEFAULT_RELATION_TYPE;
}

/** frontmatter の related を [{ to, type }] へ正規化する。 */
function normalizeRelated(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const e of raw) {
    if (typeof e === 'string') out.push({ to: e, type: DEFAULT_RELATION_TYPE });
    else if (e && typeof e === 'object' && typeof e.to === 'string') out.push({ to: e.to, type: coerceType(e.type) });
  }
  return out;
}

/** 1 ファイルを索引エントリへ変換する。対象外なら null。 */
function toEntry(specDir, absPath) {
  let data;
  try {
    data = matter(fs.readFileSync(absPath, 'utf8')).data ?? {};
  } catch (err) {
    process.stderr.write(`[gen-spec-index] parse skip: ${absPath} ${String(err)}\n`);
    return null;
  }
  const title = typeof data.title === 'string' ? data.title : undefined;
  if (!title) return null;
  if (data.graph !== undefined && GRAPH_FALSE.has(String(data.graph).toLowerCase())) return null;
  const rel = path.relative(specDir, absPath).split(path.sep).join('/');
  return {
    path: `spec/${rel}`,
    relFromSpec: rel,
    title,
    category: typeof data.category === 'string' ? data.category : '',
    excerpt: typeof data.excerpt === 'string' ? data.excerpt : '',
    related: normalizeRelated(data.related),
  };
}

/** specDir 配下の .md を再帰収集してエントリ配列を返す（path 昇順）。 */
function collectEntries(specDir) {
  const entries = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (!SKIP_DIRS.has(ent.name)) walk(full);
      } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.md') && ent.name !== '00-index.ja.md') {
        const e = toEntry(specDir, full);
        if (e) entries.push(e);
      }
    }
  };
  walk(specDir);
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return entries;
}

/** トップレベルセグメント（`40.trail-viewer` 等。直下ファイルは `(root)`）。 */
function topGroup(relFromSpec) {
  const seg = relFromSpec.split('/');
  return seg.length > 1 ? seg[0] : '(root)';
}

/** 索引を走査しやすく保つため excerpt を 1 行・上限長へ切り詰める。 */
function truncateExcerpt(text, max = 160) {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1).trimEnd() + '…' : oneLine;
}

/** related を `type→target` の短い列挙へ整形する。references のみ/空は簡略表記。 */
function formatRelated(related) {
  if (!related.length) return '';
  return related.map((r) => (r.type === DEFAULT_RELATION_TYPE ? r.to : `${r.type} → ${r.to}`)).join('; ');
}

/** エントリ配列から索引 markdown を生成する（純粋関数）。 */
export function buildSpecIndexMarkdown(entries, date, opts = {}) {
  const indexTitle = typeof opts.title === 'string' && opts.title ? opts.title : '設計書 索引（自動生成）';
  const scopeName = typeof opts.scopeName === 'string' && opts.scopeName ? opts.scopeName : 'spec';
  const groups = new Map();
  for (const e of entries) {
    const g = topGroup(e.relFromSpec);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(e);
  }
  const groupKeys = [...groups.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const lines = [];
  lines.push('---');
  lines.push(`title: "${indexTitle}"`);
  lines.push(`date: "${date}"`);
  lines.push('type: "reference"');
  lines.push('lang: "ja"');
  lines.push('graph: false');
  lines.push(`excerpt: "${scopeName} 配下の frontmatter（title / category / excerpt / 型付き related）から自動生成した索引。人と Claude の決定論的ナビゲーションの入口。"`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${indexTitle}`);
  lines.push('');
  lines.push('> このファイルは `scripts/gen-spec-index.mjs` が frontmatter から生成する。手で編集しない。');
  lines.push('> 関係は各ファイルの frontmatter `related`（型付き）が単一ソース。型: ' + RELATION_TYPES.join(' / ') + '。');
  lines.push('');
  lines.push(`総数: ${entries.length} 件`);
  lines.push('');

  for (const g of groupKeys) {
    const items = groups.get(g);
    lines.push(`## ${g}`);
    lines.push('');
    for (const e of items) {
      const cat = e.category ? ` \`${e.category}\`` : '';
      lines.push(`### [${e.title}](${e.relFromSpec})${cat}`);
      lines.push('');
      if (e.excerpt) {
        lines.push(truncateExcerpt(e.excerpt));
        lines.push('');
      }
      const rel = formatRelated(e.related);
      if (rel) {
        lines.push(`関連: ${rel}`);
        lines.push('');
      }
    }
  }
  return lines.join('\n');
}

function isoDate() {
  // 生成日（YYYY-MM-DD・JST）。引数で上書き可能にして決定性を保つ。
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
}

function main() {
  const specDir = path.resolve(process.argv[2] ?? '/Shared/anytime-markdown-docs/spec');
  const outFile = path.resolve(process.argv[3] ?? path.join(specDir, '00-index.ja.md'));
  if (!fs.existsSync(specDir)) {
    process.stderr.write(`[gen-spec-index] spec dir not found: ${specDir}\n`);
    process.exit(1);
  }
  const entries = collectEntries(specDir);
  const md = buildSpecIndexMarkdown(entries, isoDate(), { title: process.argv[4], scopeName: process.argv[5] });
  fs.writeFileSync(outFile, md + '\n', 'utf8');
  process.stdout.write(`[gen-spec-index] wrote ${entries.length} entries to ${outFile}\n`);
}

// CLI 実行時のみ main（import 時はスキップ＝純粋関数を再利用可能に）
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main();
}
