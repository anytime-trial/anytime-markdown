/**
 * 節粒度のキーワード検索（FTS5・doc_section_fts）。`search_docs→get_outline→get_section` の
 * 3 コールを 1 コールに圧縮するための「heading＋snippet」を返す。
 *
 * query は必須（節検索はキーワード前提）。frontmatter facet（category/type/lang）は doc JOIN で
 * AND 絞り込みする。snippet は body 列（doc_section_fts の列 index 3）から取得。
 */

import type { DocDb } from '../db/open';
import type { SectionHit } from '../types';
import { toFtsMatch } from './fts';

/** 既定の最大件数（トークン節約のため小さめ・search_docs と統一）。 */
const DEFAULT_LIMIT = 8;
/** 既定の snippet トークン数（FTS5 snippet・最大 64・search_docs と統一）。 */
const DEFAULT_SNIPPET_TOKENS = 24;

export interface SearchSectionsOptions {
  /** フリーテキスト（FTS5）。必須。 */
  query: string;
  /** frontmatter category 完全一致。 */
  category?: string;
  /** frontmatter type 完全一致。 */
  type?: string;
  /** frontmatter lang 完全一致。 */
  lang?: string;
  /** 最大件数（既定 8）。 */
  limit?: number;
  /** snippet のトークン数（FTS5 snippet・既定 24・最大 64）。trigram のため約 N 文字相当。 */
  snippetTokens?: number;
}

interface Row {
  path: string;
  heading: string;
  // FTS5 は全列を text で返すため level は文字列で来る。Number() で数値化する。
  level: string | number;
  score: number;
  snippet: string | null;
}

export function searchSections(db: DocDb, opts: SearchSectionsOptions): SectionHit[] {
  const match = toFtsMatch(opts.query ?? '');
  if (!match) return [];
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
  const facetSql = facetClauses.length ? `WHERE ${facetClauses.join(' AND ')}` : '';

  // snippet(doc_section_fts, 3, ...) の列 index 3 = body（doc_section_fts(path,heading,level,body)）。
  const rows = db
    .prepare(
      `SELECT m.path AS path, m.heading AS heading, m.level AS level, m.score AS score, m.snippet AS snippet
       FROM (
         SELECT path, heading, level, rank AS score,
                snippet(doc_section_fts, 3, '', '', '…', ?) AS snippet
         FROM doc_section_fts WHERE doc_section_fts MATCH ? ORDER BY rank
       ) AS m
       JOIN doc AS d ON d.path = m.path
       ${facetSql}
       ORDER BY m.score LIMIT ?`,
    )
    .all(snippetTokens, match, ...facetParams, limit) as unknown as Row[];

  return rows.map((r) => {
    const hit: SectionHit = {
      path: r.path,
      heading: r.heading,
      level: Number(r.level),
      score: r.score,
    };
    if (r.snippet) hit.snippet = r.snippet;
    return hit;
  });
}
