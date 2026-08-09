import type { C4Element } from '../types';

/**
 * 指定された parentId の配下にある全子孫要素の ID を再帰的に収集する。
 * boundaryId チェインを辿り、循環参照にも安全。
 */
export function collectDescendantIds(
  elements: readonly C4Element[],
  parentId: string,
): Set<string> {
  const result = new Set<string>();

  function recurse(id: string): void {
    for (const el of elements) {
      if (el.boundaryId === id && !result.has(el.id)) {
        result.add(el.id);
        recurse(el.id);
      }
    }
  }

  recurse(parentId);
  return result;
}
