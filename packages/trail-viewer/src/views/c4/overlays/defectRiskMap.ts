import { buildC4ElementById, mapFileToC4Elements, rollupMaxToAncestors } from '@anytime-markdown/trail-core/c4';
import type { C4Model } from '@anytime-markdown/trail-core/c4';
import type { DefectRiskEntry } from '@anytime-markdown/trail-core';

/**
 * ファイル単位の欠陥リスクを C4 要素単位へ集約する（Phase 6 S5-A）。
 * ファイル → 直接対応要素は最大値、そこから祖先 boundary へは共有 rollup で伝播する。
 * 伝播しないと、コンポーネント・コンテナのノードに子孫ファイルのリスクが出ない。
 */
export function buildDefectRiskElementMap(
  entries: readonly DefectRiskEntry[],
  c4Model: C4Model,
): ReadonlyMap<string, number> {
  const elementById = buildC4ElementById(c4Model.elements);
  const direct = new Map<string, number>();
  for (const entry of entries) {
    for (const m of mapFileToC4Elements(entry.filePath, elementById)) {
      direct.set(m.elementId, Math.max(direct.get(m.elementId) ?? 0, entry.score));
    }
  }
  return rollupMaxToAncestors(direct, c4Model);
}
