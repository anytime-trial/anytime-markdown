/**
 * 節ベース意味検索（FR-5）。クエリを embed して全 catalog_doc_section_embedding と
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
 * @param model 指定時はこのモデルの行だけをスコアリングする。モデル変更の backfill が
 *              途中失敗すると新旧モデルの行が混在し得るため、クエリ側モデルと一致する
 *              行に絞らないと異なる次元/空間のベクトルまで cosine 対象になり無言で劣化する。
 */
export async function searchSemanticSections(
  db: DocDb,
  embed: EmbedFn,
  query: string,
  k = 10,
  model?: string,
): Promise<SectionHit[]> {
  const qVec = await embed(query);
  if (!Array.isArray(qVec) || qVec.length === 0) return [];
  const rows = (
    model === undefined
      ? db.prepare('SELECT path, heading, level, vec FROM catalog_doc_section_embedding').all()
      : db.prepare('SELECT path, heading, level, vec FROM catalog_doc_section_embedding WHERE model = ?').all(model)
  ) as unknown as SecEmbRow[];

  const scored: SectionHit[] = rows.map((r) => ({
    path: r.path,
    heading: r.heading,
    level: r.level,
    score: cosineSim(qVec, blobToFloat32(r.vec)),
  }));
  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return scored.slice(0, k);
}
