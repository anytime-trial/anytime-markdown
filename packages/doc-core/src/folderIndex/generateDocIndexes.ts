/**
 * ドキュメント索引（index.<lang>.md）をフォルダ単位で再帰生成する。
 *
 * OKF の「各フォルダに index を置く」入れ子構造を採用し、人と AI が
 * 「フォルダ index → サブフォルダ index → 文書」と段階的に辿れるようにする（低トークン）。
 *
 * **冪等性**: 生成結果が既存ファイルと `date` 行を除いて同一なら書き込まない。
 * 索引は 70 以上のフォルダに広がるため、無条件書き込みだと日付をまたぐだけで
 * 全索引が変更扱いになり、自動実行のたびに作業ツリーが汚れる（要件書 FR-1）。
 */

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { coerceRelationType, type RelationType } from '../relations';
import {
  buildFolderIndexMarkdown,
  type FolderIndexEntry,
  type FolderIndexChild,
} from './buildFolderIndex';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  'build',
  '.next',
  '.claude',
  'images',
]);
/** frontmatter の graph が偽値なら索引に載せない（グラフ非表示文書の除外に合わせる）。 */
const GRAPH_FALSE = new Set(['false', 'no', 'off', '0']);

export interface GenerateDocIndexesOptions {
  /** 索引を生成する起点ディレクトリ */
  readonly docDir: string;
  /** タイトル先頭に使う表示名（例: 設計書） */
  readonly scopeLabel?: string;
  readonly lang?: string;
  /** frontmatter に埋める生成日。省略時は JST の当日（テストからの注入用に開けている） */
  readonly date?: string;
  /** 解析不能ファイル等の警告出力先。省略時は console.warn（silent skip を作らない） */
  readonly onWarn?: (message: string) => void;
}

export interface GenerateDocIndexesResult {
  /** 内容差分があり書き込んだ索引の件数 */
  readonly written: number;
  /** 内容不変のため据え置いた索引の件数 */
  readonly unchanged: number;
  /** 走査したフォルダ数（written + unchanged） */
  readonly folders: number;
}

/** 生成済み索引ファイル名（index.<lang>.md / index.md）。文書エントリから除外する。 */
export function isIndexName(name: string): boolean {
  return /^index\.[a-z]{2}\.md$/i.test(name) || name === 'index.md';
}

/** 生成日（YYYY-MM-DD・JST）。 */
export function isoDateJst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(now);
}

/**
 * frontmatter の `date` 行だけを伏せて比較する。
 *
 * `date` は生成時刻から決まるため、これを含めて比較すると内容不変でも毎回差分になる。
 * 逆に日付以外の差分（文書の追加・title/excerpt/related の変更・件数の増減）は
 * すべて検出する必要があるため、伏せるのは frontmatter 先頭の 1 行に限る。
 */
export function isSameIgnoringDate(a: string, b: string): boolean {
  return maskDateLine(a) === maskDateLine(b);
}

function maskDateLine(text: string): string {
  return text.replace(/^date: "[^"]*"$/m, 'date: "<masked>"');
}

/** frontmatter の related を [{ to, type }] へ正規化する。 */
function normalizeRelated(raw: unknown): { to: string; type: RelationType }[] {
  if (!Array.isArray(raw)) return [];
  const out: { to: string; type: RelationType }[] = [];
  for (const e of raw) {
    if (typeof e === 'string') {
      out.push({ to: e, type: coerceRelationType(undefined) });
    } else if (e && typeof e === 'object' && typeof (e as { to?: unknown }).to === 'string') {
      const rel = e as { to: string; type?: unknown };
      out.push({ to: rel.to, type: coerceRelationType(rel.type) });
    }
  }
  return out;
}

/** 1 ファイルを索引エントリへ変換する。title 無し / graph:false は null。 */
function toEntry(
  absPath: string,
  name: string,
  onWarn: (message: string) => void,
): FolderIndexEntry | null {
  let data: Record<string, unknown>;
  try {
    data = (matter(fs.readFileSync(absPath, 'utf8')).data ?? {}) as Record<string, unknown>;
  } catch (err) {
    onWarn(`[doc-index] parse skip: ${absPath} ${String(err)}`);
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
function dirEntries(dir: string, onWarn: (message: string) => void): FolderIndexEntry[] {
  const out: FolderIndexEntry[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isFile() && ent.name.toLowerCase().endsWith('.md') && !isIndexName(ent.name)) {
      const e = toEntry(path.join(dir, ent.name), ent.name, onWarn);
      if (e) out.push(e);
    }
  }
  out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return out;
}

/** dir 配下の md 件数（再帰・索引除外）。 */
function countMd(dir: string): number {
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
function subDirs(dir: string): string[] {
  const out: string[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory() && !SKIP_DIRS.has(ent.name)) {
      if (countMd(path.join(dir, ent.name)) > 0) out.push(ent.name);
    }
  }
  out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return out;
}

interface WalkContext {
  readonly scopeLabel: string;
  readonly lang: string;
  readonly date: string;
  readonly onWarn: (message: string) => void;
}

interface WalkCounts {
  written: number;
  unchanged: number;
}

function walk(dir: string, rel: string, ctx: WalkContext, counts: WalkCounts): void {
  const entries = dirEntries(dir, ctx.onWarn);
  const subs = subDirs(dir);
  const children: FolderIndexChild[] = subs.map((name) => ({
    name,
    count: countMd(path.join(dir, name)),
  }));
  const titlePath = rel === '' ? ctx.scopeLabel : `${ctx.scopeLabel}/${rel}`;
  const md =
    buildFolderIndexMarkdown({
      titlePath,
      lang: ctx.lang,
      date: ctx.date,
      entries,
      children,
    }) + '\n';

  const target = path.join(dir, `index.${ctx.lang}.md`);
  const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : undefined;
  if (existing !== undefined && isSameIgnoringDate(existing, md)) {
    // 内容不変。既存の date を保つため書き込まない（冪等性の要）。
    counts.unchanged += 1;
  } else {
    fs.writeFileSync(target, md, 'utf8');
    counts.written += 1;
  }

  for (const name of subs) {
    walk(path.join(dir, name), rel === '' ? name : `${rel}/${name}`, ctx, counts);
  }
}

/**
 * docDir を再帰し、md を含む各フォルダへ index.<lang>.md を生成する。
 *
 * 内容が変わらないフォルダは書き込まないため、連続実行しても 2 回目以降は
 * `written` が 0 になる。
 *
 * @throws docDir が存在しない場合
 */
export function generateDocIndexes(options: GenerateDocIndexesOptions): GenerateDocIndexesResult {
  const {
    docDir,
    scopeLabel = '設計書',
    lang = 'ja',
    date = isoDateJst(),
    onWarn = (message: string) => console.warn(message),
  } = options;

  const resolved = path.resolve(docDir);
  if (!fs.existsSync(resolved)) {
    throw new Error(`[doc-index] dir not found: ${resolved}`);
  }

  const counts: WalkCounts = { written: 0, unchanged: 0 };
  walk(resolved, '', { scopeLabel, lang, date, onWarn }, counts);
  return { written: counts.written, unchanged: counts.unchanged, folders: counts.written + counts.unchanged };
}
