/**
 * 節ベース意味検索（FR-5）。クエリを embed して全 doc_section_embedding と
 * cosine top-k（葉節数千件規模はブルートフォースで数 ms）。
 */

import type { DocDb } from '../db/open';
import type { SectionHit } from '../types';
import type { EmbedFn } from '../embedding/embedDocs';
import { blobToFloat32 } from '../embedding/blob';
import { cosineSim } from '../embedding/cosine';

interface SecEmbRow {
  path: string;
  heading: string;
  level: number;
  vec: Uint8Array;
}

/**
 * 節単位の意味検索（cosine top-k・score は大きいほど良い）。節埋め込み未生成なら空配列。
 *
 * @param embed クエリ用埋め込み関数（節 embedding と同一モデルであること）
 */
export async function searchSemanticSections(
  db: DocDb,
  embed: EmbedFn,
  query: string,
  k = 10,
): Promise<SectionHit[]> {
  const qVec = await embed(query);
  if (!Array.isArray(qVec) || qVec.length === 0) return [];
  const rows = db
    .prepare('SELECT path, heading, level, vec FROM doc_section_embedding')
    .all() as unknown as SecEmbRow[];

  const scored: SectionHit[] = rows.map((r) => ({
    path: r.path,
    heading: r.heading,
    level: r.level,
    score: cosineSim(qVec, blobToFloat32(r.vec)),
  }));
  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return scored.slice(0, k);
}
