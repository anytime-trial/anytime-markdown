import type { C4Element } from '../domain/engine/c4Mapper';
import { mapFilesToC4Elements } from '../domain/engine/c4Mapper';

/**
 * ファイル単位のスコアを C4 要素レベルへ集約する。
 *
 * - 各ファイルを mapFilesToC4Elements でマップし、最初のマッチ要素 (leaf) にのみスコアを加算 (leafOnly)
 * - system 要素は除外
 * - 全要素中の最大値を 100 に正規化した Record を返す
 */
export function aggregateCentralityToC4(
  fileScores: Record<string, number>,
  elements: readonly C4Element[],
): Record<string, number> {
  const mappable = elements.filter((e) => e.type !== 'system');
  const sumByElement: Record<string, number> = {};

  for (const [filePath, score] of Object.entries(fileScores)) {
    const mappings = mapFilesToC4Elements([filePath], mappable);
    if (mappings.length === 0) continue;
    // leafOnly: boundaryId チェーンの親への伝播なし、最初のマッチのみ
    const leaf = mappings[0];
    sumByElement[leaf.elementId] = (sumByElement[leaf.elementId] ?? 0) + score;
  }

  const values = Object.values(sumByElement);
  const maxSum = values.length > 0 ? Math.max(...values) : 0;

  if (maxSum === 0) {
    const zero: Record<string, number> = {};
    for (const id of Object.keys(sumByElement)) zero[id] = 0;
    return zero;
  }

  const result: Record<string, number> = {};
  for (const [id, sum] of Object.entries(sumByElement)) {
    result[id] = Math.round((100 * sum) / maxSum);
  }
  return result;
}
