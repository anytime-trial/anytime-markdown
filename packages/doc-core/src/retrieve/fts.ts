/**
 * キーワード検索（FTS5）。ユーザー入力はトークン化して安全な MATCH 式に組み立てる。
 */

import type { DocDb } from '../db/open';
import type { DocHit } from '../types';

/** 任意入力を FTS5 で安全な MATCH 式へ（語をダブルクォートし暗黙 AND）。空なら null。 */
export function toFtsMatch(query: string): string | null {
  const terms = query.match(/[\p{L}\p{N}_]+/gu);
  if (!terms || terms.length === 0) return null;
  return terms.map((t) => `"${t}"`).join(' ');
}

/**
 * FTS5 でキーワード検索する（rank 昇順＝関連度高い順）。
 * @returns 一致ドキュメント。score は FTS5 rank（小さいほど良い）。
 */
export function searchFts(db: DocDb, query: string, limit = 20): DocHit[] {
  const match = toFtsMatch(query);
  if (!match) return [];
  const rows = db
    .prepare(
      `SELECT m.path AS path, d.title AS title, d.category AS category, m.score AS score
       FROM (
         SELECT path, rank AS score FROM doc_fts WHERE doc_fts MATCH ? ORDER BY rank LIMIT ?
       ) AS m
       LEFT JOIN doc AS d ON d.path = m.path
       ORDER BY m.score`,
    )
    .all(match, limit) as { path: string; title: string | null; category: string | null; score: number }[];
  return rows.map((r) => ({
    path: r.path,
    title: r.title ?? undefined,
    category: r.category ?? undefined,
    score: r.score,
  }));
}
