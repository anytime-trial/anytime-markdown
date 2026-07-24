/**
 * 埋め込み対象節の選定純粋関数（FR-3）。
 *
 * 葉節（子見出しを持たない節）とリード節のみを選ぶ。親節は子見出しの本文を
 * 含む（splitSections の意図的重複）ため、埋め込むと同一 doc の親子で
 * 類似度上位が重複するバイアスを生む — 除外して情報の重複を断つ。
 */

import type { DocSection } from '../ingest/splitSections';

/** 埋め込み対象に選ばれた節。sectionIdx は選定後の文書順連番（0-based）。 */
export interface EmbedSection extends DocSection {
  sectionIdx: number;
}

/**
 * 葉節＋リード節を文書順に返す。
 *
 * splitSections の出力は文書順であり、節 i が親（子見出しを含む）かどうかは
 * 直後の節のレベルだけで決まる: level(i+1) > level(i) なら i は親。
 * リード節（level 0・本文は最初の見出しで終わる）は子を含まないため常に選ぶ。
 */
export function selectEmbedSections(sections: DocSection[]): EmbedSection[] {
  const selected: EmbedSection[] = [];
  for (let i = 0; i < sections.length; i++) {
    const cur = sections[i];
    const isLead = cur.level === 0;
    const next = sections[i + 1];
    const hasChild = !isLead && next !== undefined && next.level > cur.level;
    if (hasChild) continue;
    selected.push({ ...cur, sectionIdx: selected.length });
  }
  return selected;
}
