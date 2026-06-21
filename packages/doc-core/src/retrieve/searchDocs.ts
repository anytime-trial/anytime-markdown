/**
 * frontmatter ファセット（category / type / lang）＋任意キーワード（FTS5）でドキュメントを検索する。
 * - query 指定時: FTS MATCH の関連度順（rank 昇順）。facet で AND 絞り込み。
 * - query 未指定時: facet のみ（または全件）を path 昇順。
 */

import type { DocDb } from '../db/open';
import type { DocHit } from '../types';
import { toFtsMatch } from './fts';

export interface SearchDocsOptions {
  /** フリーテキスト（FTS5）。未指定なら facet のみで検索。 */
  query?: string;
  /** frontmatter category 完全一致。 */
  category?: string;
  /** frontmatter type 完全一致。 */
  type?: string;
  /** frontmatter lang 完全一致。 */
  lang?: string;
  /** 最大件数（既定 20）。 */
  limit?: number;
}

interface Row {
  path: string;
  title: string | null;
  category: string | null;
  score?: number;
}

function toHit(r: Row): DocHit {
  return {
    path: r.path,
    title: r.title ?? undefined,
    category: r.category ?? undefined,
    score: r.score,
  };
}

export function searchDocs(db: DocDb, opts: SearchDocsOptions = {}): DocHit[] {
  const limit = opts.limit ?? 20;

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
    const rows = db
      .prepare(
        `SELECT d.path AS path, d.title AS title, d.category AS category, m.score AS score
         FROM (SELECT path, rank AS score FROM doc_fts WHERE doc_fts MATCH ? ORDER BY rank) AS m
         JOIN doc AS d ON d.path = m.path
         ${facetSql}
         ORDER BY m.score LIMIT ?`,
      )
      .all(match, ...facetParams, limit) as unknown as Row[];
    return rows.map(toHit);
  }

  // キーワードなし＝facet のみ（facet も無ければ全件 path 昇順）。
  const whereSql = facetClauses.length ? `WHERE ${facetClauses.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT d.path AS path, d.title AS title, d.category AS category
       FROM doc AS d ${whereSql} ORDER BY d.path LIMIT ?`,
    )
    .all(...facetParams, limit) as unknown as Row[];
  return rows.map(toHit);
}
