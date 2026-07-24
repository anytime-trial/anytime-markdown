/**
 * 埋め込み対象節の選定純粋関数（FR-3）。
 *
 * 分割は {@link splitOwnSections}（各見出しの固有本文・区間が互いに素）を使う。
 * splitSections の親節は子見出しの本文を丸ごと含むため、そのまま埋め込むと
 * 同一 doc の親子で類似度上位が重複するバイアスを生み、かといって親節を
 * 除外すると「親見出し直下・子見出し前の固有テキスト」が検索から脱落する。
 * 固有本文の disjoint 被覆は重複ゼロと死角ゼロを同時に満たす。
 */

import { splitOwnSections, type DocSection } from '../ingest/splitSections';

/** 埋め込み対象に選ばれた節。sectionIdx は選定後の文書順連番（0-based）。 */
export interface EmbedSection extends DocSection {
  sectionIdx: number;
}

/** 本文から埋め込み対象節（リード節＋各見出しの固有本文・空本文除外）を文書順に返す。 */
export function selectEmbedSections(body: string): EmbedSection[] {
  const selected: EmbedSection[] = [];
  for (const s of splitOwnSections(body)) {
    if (!s.text) continue;
    selected.push({ ...s, sectionIdx: selected.length });
  }
  return selected;
}
