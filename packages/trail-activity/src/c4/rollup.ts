import type { C4Element, C4Model } from './types';

/**
 * 要素自身から boundaryId を辿った祖先チェーンを返す（先頭が自身）。
 * boundaryId が循環していても visited で打ち切るため無限ループしない。
 */
export function buildAncestorChain(
  elementById: ReadonlyMap<string, C4Element>,
  startId: string,
): readonly string[] {
  const chain: string[] = [];
  const visited = new Set<string>();
  let cur: string | undefined = startId;
  while (cur && !visited.has(cur)) {
    visited.add(cur);
    chain.push(cur);
    cur = elementById.get(cur)?.boundaryId;
  }
  return chain;
}

/**
 * 要素単位の値を祖先 boundary へ最大値で伝播する。
 * hotspot（churn / complexity）と defect-risk が共有する（Phase 6 S5-A）。
 * モデルに存在しない ID は無視する。
 */
export function rollupMaxToAncestors(
  baseValues: ReadonlyMap<string, number>,
  c4Model: C4Model,
): Map<string, number> {
  const elementById = new Map(c4Model.elements.map((el) => [el.id, el] as const));
  const result = new Map<string, number>();
  for (const [id, value] of baseValues) {
    if (!elementById.has(id)) continue;
    for (const ancestorId of buildAncestorChain(elementById, id)) {
      const prev = result.get(ancestorId);
      if (prev === undefined || value > prev) result.set(ancestorId, value);
    }
  }
  return result;
}
