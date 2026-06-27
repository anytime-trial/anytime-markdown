#!/usr/bin/env node
// ドキュメント索引（index.<lang>.md）をフォルダ単位で生成する（OKF 段階開示・フォルダ別 index）。
//
// 目的: OKF の「各フォルダに index を置く」入れ子構造を採用し、人と Claude が
// 「フォルダ index → サブフォルダ index → 文書」と段階的に辿れるようにする（低トークン）。
//
// 仕組み: docDir を再帰的に walk し、md を含む各フォルダに index.<lang>.md を生成する。
// 各 index は (1) 直下サブフォルダの index へのリンク（再帰 md 件数つき） と
// (2) 直下 md の frontmatter（title / category / excerpt / 型付き related）エントリ を載せる。
// ルート（docDir/index.<lang>.md）はサブフォルダ目次になる。
//
// 使い方: node scripts/gen-spec-index.mjs [docDir] [scopeLabel] [lang]
//   docDir 既定: /Shared/anytime-markdown-docs/spec
//   scopeLabel 既定: 設計書（タイトル先頭に使う表示名） / lang 既定: ja

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const matter = require('gray-matter');

const RELATION_TYPES = ['references', 'depends-on', 'implements', 'part-of', 'supersedes', 'refines'];
const DEFAULT_RELATION_TYPE = 'references';
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out', 'build', '.next', '.claude', 'images']);
const GRAPH_FALSE = new Set(['false', 'no', 'off', '0']);

/** 生成済み索引ファイル名（index.<lang>.md / index.md）。文書エントリから除外する。 */
function isIndexName(name) {
  return /^index\.[a-z]{2}\.md$/i.test(name) || name === 'index.md';
}

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

/** 索引を走査しやすく保つため excerpt を 1 行・上限長へ切り詰める。 */
function truncateExcerpt(text, max = 160) {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1).trimEnd() + '…' : oneLine;
}

/** related を `type→target` の短い列挙へ整形する。 */
function formatRelated(related) {
  if (!related.length) return '';
  return related.map((r) => (r.type === DEFAULT_RELATION_TYPE ? r.to : `${r.type} → ${r.to}`)).join('; ');
}

/** 1 ファイルを索引エントリへ変換する。title 無し/graph:false は null。 */
function toEntry(absPath, name) {
  let data;
  try {
    data = matter(fs.readFileSync(absPath, 'utf8')).data ?? {};
  } catch (err) {
    process.stderr.write(`[gen-doc-index] parse skip: ${absPath} ${String(err)}\n`);
    return null;
  }
  const title = typeof data.title === 'string' ? data.title : undefined;
  if (!title) return null;
  if (data.graph !== undefined && GRAPH_FALSE.has(String(data.graph).toLowerCase())) return null;
  return {
    name,
    title,
    category: typeof data.category === 'string' ? data.category : '',
    excerpt: typeof data.excerpt === 'string' ? data.excerpt : '',
    related: normalizeRelated(data.related),
  };
}

/** dir 直下の md エントリ（索引除外・name 昇順）。 */
function dirEntries(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isFile() && ent.name.toLowerCase().endsWith('.md') && !isIndexName(ent.name)) {
      const e = toEntry(path.join(dir, ent.name), ent.name);
      if (e) out.push(e);
    }
  }
  out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return out;
}

/** dir 配下の md 件数（再帰・索引除外）。 */
function countMd(dir) {
  let n = 0;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!SKIP_DIRS.has(ent.name)) n += countMd(full);
    } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.md') && !isIndexName(ent.name)) {
      n += 1;
    }
  }
  return n;
}

/** dir 直下のサブフォルダ（md を含むもののみ・name 昇順）。 */
function subDirs(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory() && !SKIP_DIRS.has(ent.name)) {
      const full = path.join(dir, ent.name);
      if (countMd(full) > 0) out.push(ent.name);
    }
  }
  out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return out;
}

/** 1 フォルダの索引 markdown を生成する（純粋関数）。 */
export function buildFolderIndexMarkdown({ titlePath, lang, date, entries, children }) {
  const total = entries.length + children.reduce((s, c) => s + c.count, 0);
  const lines = [];
  lines.push('---');
  lines.push(`title: "${titlePath} 索引（自動生成）"`);
  lines.push(`date: "${date}"`);
  lines.push('type: "reference"');
  lines.push(`lang: "${lang}"`);
  lines.push('graph: false');
  lines.push(`excerpt: "${titlePath} 配下の frontmatter から自動生成したフォルダ索引（OKF 段階開示）。サブフォルダ索引と直下文書への入口。"`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${titlePath} 索引（自動生成）`);
  lines.push('');
  lines.push('> このファイルは `scripts/gen-spec-index.mjs` が frontmatter から生成する。手で編集しない。');
  lines.push(`> 関係は各ファイルの frontmatter \`related\`（型付き）が単一ソース。型: ${RELATION_TYPES.join(' / ')}。`);
  lines.push('');
  lines.push(`総数: ${total} 件`);
  lines.push('');

  if (children.length) {
    lines.push('## サブフォルダ');
    lines.push('');
    for (const c of children) {
      lines.push(`- [${c.name}/](${c.name}/index.${lang}.md) — ${c.count} 件`);
    }
    lines.push('');
  }

  if (entries.length) {
    lines.push('## 文書');
    lines.push('');
    for (const e of entries) {
      const cat = e.category ? ` \`${e.category}\`` : '';
      lines.push(`### [${e.title}](${e.name})${cat}`);
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

/** docDir を再帰し、md を含む各フォルダへ index.<lang>.md を書き出す。 */
function generateTree(dir, rel, opts) {
  const { scopeLabel, lang, date } = opts;
  const entries = dirEntries(dir);
  const subs = subDirs(dir);
  const children = subs.map((name) => ({ name, count: countMd(path.join(dir, name)) }));
  const titlePath = rel === '' ? scopeLabel : `${scopeLabel}/${rel}`;
  const md = buildFolderIndexMarkdown({ titlePath, lang, date, entries, children });
  fs.writeFileSync(path.join(dir, `index.${lang}.md`), md + '\n', 'utf8');
  let count = 1;
  for (const name of subs) {
    count += generateTree(path.join(dir, name), rel === '' ? name : `${rel}/${name}`, opts);
  }
  return count;
}

function isoDate() {
  // 生成日（YYYY-MM-DD・JST）。
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
}

function main() {
  const docDir = path.resolve(process.argv[2] ?? '/Shared/anytime-markdown-docs/spec');
  const scopeLabel = process.argv[3] ?? '設計書';
  const lang = process.argv[4] ?? 'ja';
  if (!fs.existsSync(docDir)) {
    process.stderr.write(`[gen-doc-index] dir not found: ${docDir}\n`);
    process.exit(1);
  }
  const n = generateTree(docDir, '', { scopeLabel, lang, date: isoDate() });
  process.stdout.write(`[gen-doc-index] wrote ${n} folder indexes under ${docDir}\n`);
}

// CLI 実行時のみ main（import 時はスキップ＝純粋関数を再利用可能に）
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main();
}
