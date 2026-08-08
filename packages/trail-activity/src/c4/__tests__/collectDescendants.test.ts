import { collectDescendantIds } from '../view/collectDescendants';
import type { C4Element } from '../types';

function el(id: string, boundaryId?: string): C4Element {
  return { id, type: 'component', name: id, boundaryId };
}

describe('collectDescendantIds', () => {
  it('returns empty set when no elements match', () => {
    const elements: readonly C4Element[] = [el('a'), el('b')];
    const result = collectDescendantIds(elements, 'nonexistent');
    expect(result.size).toBe(0);
  });

  it('collects direct children', () => {
    const elements: readonly C4Element[] = [
      el('parent'),
      el('child1', 'parent'),
      el('child2', 'parent'),
      el('other'),
    ];
    const result = collectDescendantIds(elements, 'parent');
    expect(result).toEqual(new Set(['child1', 'child2']));
  });

  it('collects nested descendants recursively', () => {
    const elements: readonly C4Element[] = [
      el('root'),
      el('a', 'root'),
      el('b', 'a'),
      el('c', 'b'),
      el('unrelated'),
    ];
    const result = collectDescendantIds(elements, 'root');
    expect(result).toEqual(new Set(['a', 'b', 'c']));
  });

  it('handles circular references without infinite loop', () => {
    // elements where a -> b -> a (circular boundaryId)
    const elements: readonly C4Element[] = [
      { id: 'a', type: 'component', name: 'a', boundaryId: 'b' },
      { id: 'b', type: 'component', name: 'b', boundaryId: 'a' },
    ];
    const result = collectDescendantIds(elements, 'a');
    expect(result).toEqual(new Set(['b', 'a']));
  });

  it('returns empty set for leaf element with no children', () => {
    const elements: readonly C4Element[] = [el('leaf', 'parent'), el('parent')];
    const result = collectDescendantIds(elements, 'leaf');
    expect(result.size).toBe(0);
  });
});
