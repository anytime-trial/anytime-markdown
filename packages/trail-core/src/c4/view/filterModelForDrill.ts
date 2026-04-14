import type { C4Element, C4Model } from '../types';

/**
 * root 要素の子要素のみを表示するフィルタリングされた C4Model を返す。
 * root 自身は elements に含めず、root.children を新たなトップレベル要素とする。
 * relationships は可視要素（子孫）間のものだけに絞る。
 */
export function filterModelForDrill(model: C4Model, root: C4Element): C4Model {
  const visibleIds = collectAllIds(root.children ?? []);

  const filteredRelationships = model.relationships.filter(
    (rel) => visibleIds.has(rel.from) && visibleIds.has(rel.to),
  );

  return {
    ...model,
    elements: root.children ? [...root.children] : [],
    relationships: filteredRelationships,
  };
}

/**
 * C4Element の配列を再帰的に走査して、すべての要素 ID を収集する。
 */
function collectAllIds(elements: readonly C4Element[]): Set<string> {
  const ids = new Set<string>();
  function traverse(elems: readonly C4Element[]): void {
    for (const el of elems) {
      ids.add(el.id);
      if (el.children) traverse(el.children);
    }
  }
  traverse(elements);
  return ids;
}
