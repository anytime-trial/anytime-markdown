/**
 * `.md` 1 ファイルを ingest 用の {@link ExtractedDoc} へ変換する純粋関数。
 * 解析は gray-matter、関係語彙の正規化は graph-core の {@link coerceRelationType} を使う。
 */

import { createHash } from 'node:crypto';
import matter from 'gray-matter';
import { coerceRelationType, type RelationType } from '../relations';
import type { DocRelation, ExtractedDoc } from '../types';

const GRAPH_FALSE_VALUES = new Set(['false', 'no', 'off', '0']);

/** リポジトリルート相対の安全なパスか（traversal / 絶対 / ドライブレターを拒否）。 */
export function isSafeRelPath(p: string): boolean {
  if (!p) return false;
  if (p.includes('\0')) return false;
  if (p.startsWith('/') || p.startsWith('\\')) return false;
  if (/^[A-Za-z]:[\\/]/.test(p)) return false;
  return !p.split(/[\\/]/).includes('..');
}

function toStr(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return undefined;
}

/** frontmatter `related` を正規化（素文字列=references / object=型付き）。unsafe・自己参照は除外。 */
function normalizeRelated(fromPath: string, raw: unknown): DocRelation[] {
  const list = typeof raw === 'string' ? [raw] : raw;
  if (!Array.isArray(list)) return [];
  const out: DocRelation[] = [];
  for (const entry of list) {
    let to: string | undefined;
    let type: RelationType = 'references';
    if (typeof entry === 'string') {
      to = entry;
    } else if (entry && typeof entry === 'object' && typeof (entry as { to?: unknown }).to === 'string') {
      to = (entry as { to: string }).to;
      type = coerceRelationType((entry as { type?: unknown }).type);
    }
    if (!to || !isSafeRelPath(to) || to === fromPath) continue;
    out.push({ fromPath, toPath: to, type });
  }
  return out;
}

/**
 * `.md` をドキュメントへ抽出する。参加条件を満たさない場合 null
 * （frontmatter なし / title なし / graph:false / YAML 構文エラー）。
 *
 * @param relPath リポジトリルート相対 POSIX パス（ノード ID）
 * @param content ファイル本文（frontmatter 込み）
 */
export function extractDoc(relPath: string, content: string): ExtractedDoc | null {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(content);
  } catch {
    return null;
  }
  const data = parsed.data as Record<string, unknown>;
  const title = toStr(data.title);
  if (!title) return null;
  if (data.graph !== undefined && GRAPH_FALSE_VALUES.has(String(data.graph).toLowerCase())) return null;

  return {
    path: relPath,
    title,
    category: toStr(data.category),
    type: toStr(data.type),
    lang: toStr(data.lang),
    excerpt: toStr(data.excerpt),
    body: parsed.content.trim(),
    related: normalizeRelated(relPath, data.related),
    contentHash: createHash('sha256').update(content, 'utf8').digest('hex'),
  };
}
