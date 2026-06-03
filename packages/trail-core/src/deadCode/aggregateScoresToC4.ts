import type { C4Element } from '../domain/engine/c4Mapper';
import { buildC4ElementById, mapFileToC4Elements } from '../domain/engine/c4Mapper';

export interface AggregateScoresToC4Options {
  /**
   * true の場合、ファイルが直接マッチする要素 (leaf) のみにスコアを付与し、
   * boundaryId チェーンを辿った親 container/component には伝播させない。
   * dead-code-score の overlay で親フレームが色付けされるのを防ぐ用途。
   * 既定値 false (importance など既存の伝播挙動を維持)。
   */
  readonly leafOnly?: boolean;
}

/**
 * ファイル単位スコア (Record<filePath, score>) を C4 要素単位の max スコアに集約する。
 * - system 要素は除外（境界フレームに色伝播させないため）。
 * - score <= 0 のファイルはスキップ（要素に色を付けない）。
 * - leafOnly=true で親要素 (container/component) への伝播を抑止する。
 */
export function aggregateScoresToC4(
  fileScores: Record<string, number>,
  elements: readonly C4Element[],
  opts: AggregateScoresToC4Options = {},
): Record<string, number> {
  const out: Record<string, number> = {};
  const mappable = elements.filter((el) => el.type !== 'system');
  // elementById をループ前に一度だけ構築する。mapFilesToC4Elements を毎回呼ぶと
  // 内部で buildC4ElementById が走り O(F×E) になるため、単一ファイル版を使う。
  const elementById = buildC4ElementById(mappable);
  for (const [filePath, score] of Object.entries(fileScores)) {
    if (score <= 0) continue;
    const mappings = mapFileToC4Elements(filePath, elementById);
    const targets = opts.leafOnly ? mappings.slice(0, 1) : mappings;
    for (const m of targets) {
      const cur = out[m.elementId] ?? 0;
      if (score > cur) out[m.elementId] = score;
    }
  }
  return out;
}
