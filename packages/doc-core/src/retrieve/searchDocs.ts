/**
 * frontmatter ファセット（category / type / lang）＋任意キーワード（FTS5）でドキュメントを検索する。
 * - query 指定時: FTS MATCH の関連度順（rank 昇順）。facet で AND 絞り込み。snippet（一致抜粋）も返す。
 * - query 未指定時: facet のみ（または全件）を path 昇順。
 *
 * 「開かずに関連度判断」のため excerpt（doc 由来）と snippet（FTS 一致抜粋）を返す。
 * トークン肥大を避けるため limit 既定は小さめ（8）、snippet 長は snippetTokens（既定 24）で制限する。
 */

import type { DocDb } from '../db/open';
import type { DocHit } from '../types';
import { toFtsMatch } from './fts';

/** 既定の最大件数（トークン節約のため小さめ）。 */
const DEFAULT_LIMIT = 8;
/** 既定の snippet トークン数（FTS5 snippet・最大 64）。 */
const DEFAULT_SNIPPET_TOKENS = 24;

export interface SearchDocsOptions {
  /** フリーテキスト（FTS5）。未指定なら facet のみで検索。 */
  query?: string;
  /** frontmatter category 完全一致。 */
  category?: string;
  /** frontmatter type 完全一致。 */
  type?: string;
  /** frontmatter lang 完全一致。 */
  lang?: string;
  /** 最大件数（既定 8）。 */
  limit?: number;
  /** snippet のトークン数（FTS5 snippet・既定 24・最大 64）。doc_fts は trigram のため約 N 文字相当。 */
  snippetTokens?: number;
}

interface Row {
  path: string;
  title: string | null;
  category: string | null;
  excerpt: string | null;
  score?: number;
  snippet?: string | null;
}

function toHit(r: Row): DocHit {
  const hit: DocHit = {
    path: r.path,
    title: r.title ?? undefined,
    category: r.category ?? undefined,
    excerpt: r.excerpt ?? undefined,
    score: r.score,
  };
  if (r.snippet) hit.snippet = r.snippet;
  return hit;
}

export function searchDocs(db: DocDb, opts: SearchDocsOptions = {}): DocHit[] {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const snippetTokens = Math.min(64, Math.max(1, opts.snippetTokens ?? DEFAULT_SNIPPET_TOKENS));

  const facetClauses: string[] = [];
  const facetParams: string[] = [];
  if (opts.category) {
    facetClauses.push('d.category = ?');
    facetParams.push(opts.category);
  }
  if (opts.type) {
    facetClauses.push('d.type = ?');
    facetParams.push(opts.type);
  }
  if (opts.lang) {
    facetClauses.push('d.lang = ?');
    facetParams.push(opts.lang);
  }

  // クエリ指定ありの場合は FTS。有効語が無ければ空（facet だけにフォールバックしない＝意図した語が無いため）。
  if (opts.query !== undefined && opts.query !== '') {
    const match = toFtsMatch(opts.query);
    if (!match) return [];
    const facetSql = facetClauses.length ? `WHERE ${facetClauses.join(' AND ')}` : '';
    // snippet(doc_fts, 3, ...) の列 index 3 = body（doc_fts(path,title,excerpt,body)）。
    const rows = db
      .prepare(
        `SELECT d.path AS path, d.title AS title, d.category AS category, d.excerpt AS excerpt,
                m.score AS score, m.snippet AS snippet
         FROM (
           SELECT path, rank AS score, snippet(doc_fts, 3, '', '', '…', ?) AS snippet
           FROM doc_fts WHERE doc_fts MATCH ? ORDER BY rank
         ) AS m
         JOIN doc AS d ON d.path = m.path
         ${facetSql}
         ORDER BY m.score LIMIT ?`,
      )
      .all(snippetTokens, match, ...facetParams, limit) as unknown as Row[];
    return rows.map(toHit);
  }

  // キーワードなし＝facet のみ（facet も無ければ全件 path 昇順）。snippet は無し。
  const whereSql = facetClauses.length ? `WHERE ${facetClauses.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT d.path AS path, d.title AS title, d.category AS category, d.excerpt AS excerpt
       FROM doc AS d ${whereSql} ORDER BY d.path LIMIT ?`,
    )
    .all(...facetParams, limit) as unknown as Row[];
  return rows.map(toHit);
}
