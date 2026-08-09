import type { C4Element, C4Model } from '../types';
import { filterModelForDrill } from '../view/filterModelForDrill';

// テスト用ヘルパー
function makeElement(
  id: string,
  type: C4Element['type'] = 'system',
  boundaryId?: string,
): C4Element {
  return { id, type, name: id, ...(boundaryId ? { boundaryId } : {}) };
}

function makeModel(
  elements: C4Element[],
  relationships: C4Model['relationships'] = [],
): C4Model {
  return { level: 'context', elements, relationships };
}

describe('filterModelForDrill', () => {
  it('root と直接子要素（boundaryId === rootId）が elements になる', () => {
    const child1 = makeElement('c1', 'container', 'sys');
    const child2 = makeElement('c2', 'container', 'sys');
    const root = makeElement('sys', 'system');
    const model = makeModel([root, child1, child2]);

    const result = filterModelForDrill(model, 'sys');

    // root が先頭、続いて直接子要素
    expect(result.elements[0]).toEqual(root);
    expect(result.elements.slice(1)).toEqual([child1, child2]);
  });

  it('root 自身が elements の先頭に含まれる', () => {
    const child = makeElement('c1', 'container', 'sys');
    const root = makeElement('sys', 'system');
    const model = makeModel([root, child]);

    const result = filterModelForDrill(model, 'sys');

    expect(result.elements[0]).toEqual(root);
  });

  it('子要素間のリレーションシップのみ残す', () => {
    const child1 = makeElement('c1', 'container', 'sys');
    const child2 = makeElement('c2', 'container', 'sys');
    const other = makeElement('other', 'system');
    const root = makeElement('sys', 'system');
    const model = makeModel(
      [root, child1, child2, other],
      [
        { from: 'c1', to: 'c2', label: 'calls' },   // 残す
        { from: 'c1', to: 'other', label: 'uses' },  // 除外（other は可視外）
      ],
    );

    const result = filterModelForDrill(model, 'sys');

    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0]).toMatchObject({ from: 'c1', to: 'c2' });
  });

  it('直接子要素が存在しない場合は root のみ elements に含まれる', () => {
    const root = makeElement('sys', 'system');
    const model = makeModel([root]);

    const result = filterModelForDrill(model, 'sys');

    expect(result.elements).toEqual([root]);
  });

  it('孫要素（子の子）も含む全子孫のリレーションシップを残す', () => {
    const grandchild = makeElement('gc1', 'component', 'c1');
    const child = makeElement('c1', 'container', 'sys');
    const root = makeElement('sys', 'system');
    const other = makeElement('other', 'system');
    const model = makeModel(
      [root, child, grandchild, other],
      [
        { from: 'c1', to: 'gc1', label: 'contains' }, // 残す（gc1 は sys の子孫）
        { from: 'gc1', to: 'other', label: 'calls' },  // 除外（other は sys 外）
      ],
    );

    const result = filterModelForDrill(model, 'sys');

    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0]).toMatchObject({ from: 'c1', to: 'gc1' });
  });
});
