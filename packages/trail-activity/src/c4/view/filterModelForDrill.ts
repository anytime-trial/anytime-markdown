import type { C4Model } from '../types';

/**
 * rootId 要素とその直接子要素（boundaryId === rootId）を表示する
 * フィルタリングされた C4Model を返す。
 * root 自身を先頭に含めることで、c4ToGraphDocument がルートフレームを生成し
 * 子要素がその中にグルーピングされる。
 * relationships は root の全子孫間のものだけに絞る。
 */
export function filterModelForDrill(model: C4Model, rootId: string): C4Model {
  const root = model.elements.find(e => e.id === rootId);
  const directChildren = model.elements.filter(e => e.boundaryId === rootId);
  const visibleIds = collectAllDescendantIds(model.elements, rootId);

  const filteredRelationships = model.relationships.filter(
    (rel) => visibleIds.has(rel.from) && visibleIds.has(rel.to),
  );

  return {
    ...model,
    elements: root ? [root, ...directChildren] : directChildren,
    relationships: filteredRelationships,
  };
}

/**
 * elements の中から parentId の子孫 ID をすべて収集する（boundaryId チェーンを再帰的に辿る）。
 */
function collectAllDescendantIds(
  elements: C4Model['elements'],
  parentId: string,
): Set<string> {
  const ids = new Set<string>();
  function traverse(pid: string): void {
    for (const el of elements) {
      if (el.boundaryId === pid) {
        ids.add(el.id);
        traverse(el.id);
      }
    }
  }
  traverse(parentId);
  return ids;
}
