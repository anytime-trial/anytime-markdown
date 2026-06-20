/**
 * 意味検索。クエリを embed して全 doc_embedding と cosine top-k（170 件規模はブルートフォースで sub-ms）。
 */

import type { DocDb } from '../db/open';
import type { DocHit } from '../types';
import type { EmbedFn } from '../embedding/embedDocs';
import { blobToFloat32 } from '../embedding/blob';
import { cosineSim } from '../embedding/cosine';

interface EmbRow {
  path: string;
  vec: Uint8Array;
  title: string | null;
  category: string | null;
}

/**
 * 意味検索（cosine top-k）。embedding 未生成なら空配列。
 *
 * @param embed クエリ用埋め込み関数（doc の embedding と同一モデルであること）
 */
export async function searchSemantic(db: DocDb, embed: EmbedFn, query: string, k = 10): Promise<DocHit[]> {
  const qVec = await embed(query);
  if (!Array.isArray(qVec) || qVec.length === 0) return [];
  const rows = db
    .prepare(
      `SELECT e.path AS path, e.vec AS vec, d.title AS title, d.category AS category
       FROM doc_embedding AS e
       LEFT JOIN doc AS d ON d.path = e.path`,
    )
    .all() as EmbRow[];

  const scored: DocHit[] = rows.map((r) => ({
    path: r.path,
    title: r.title ?? undefined,
    category: r.category ?? undefined,
    score: cosineSim(qVec, blobToFloat32(r.vec)),
  }));
  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return scored.slice(0, k);
}
