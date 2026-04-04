import type { C4Model, BoundaryInfo } from '../types';
import { buildElementTree } from '../view/buildElementTree';

describe('buildElementTree', () => {
  it('境界なしのフラット要素をルートレベルで返す', () => {
    const model: C4Model = {
      level: 'context',
      elements: [
        { id: 'user', type: 'person', name: 'User' },
        { id: 'sys', type: 'system', name: 'System' },
      ],
      relationships: [],
    };
    const tree = buildElementTree(model, []);
    expect(tree).toHaveLength(2);
    expect(tree[0]).toEqual({ id: 'user', type: 'person', name: 'User', children: [] });
    expect(tree[1]).toEqual({ id: 'sys', type: 'system', name: 'System', children: [] });
  });

  it('boundaryIdで要素を親要素の子にグルーピングする', () => {
    const model: C4Model = {
      level: 'container',
      elements: [
        { id: 'sys', type: 'system', name: 'System' },
        { id: 'web', type: 'container', name: 'Web App', boundaryId: 'sys' },
        { id: 'api', type: 'container', name: 'API', boundaryId: 'sys' },
      ],
      relationships: [],
    };
    const boundaries: BoundaryInfo[] = [{ id: 'sys', name: 'System' }];
    const tree = buildElementTree(model, boundaries);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('sys');
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].children[0].id).toBe('web');
    expect(tree[0].children[1].id).toBe('api');
  });

  it('ネストした境界を正しく階層化する', () => {
    const model: C4Model = {
      level: 'component',
      elements: [
        { id: 'sys', type: 'system', name: 'System' },
        { id: 'web', type: 'container', name: 'Web App', boundaryId: 'sys' },
        { id: 'comp1', type: 'component', name: 'Component1', boundaryId: 'web' },
      ],
      relationships: [],
    };
    const boundaries: BoundaryInfo[] = [
      { id: 'sys', name: 'System' },
      { id: 'web', name: 'Web App' },
    ];
    const tree = buildElementTree(model, boundaries);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('sys');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].id).toBe('web');
    expect(tree[0].children[0].children).toHaveLength(1);
    expect(tree[0].children[0].children[0].id).toBe('comp1');
  });

  it('対応する要素がない境界をboundary型の仮想ノードとして生成する', () => {
    const model: C4Model = {
      level: 'context',
      elements: [
        { id: 'sys', type: 'system', name: 'Internal System', boundaryId: 'enterprise' },
      ],
      relationships: [],
    };
    const boundaries: BoundaryInfo[] = [{ id: 'enterprise', name: 'Enterprise' }];
    const tree = buildElementTree(model, boundaries);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('enterprise');
    expect(tree[0].type).toBe('boundary');
    expect(tree[0].name).toBe('Enterprise');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].id).toBe('sys');
  });

  it('external属性を保持する', () => {
    const model: C4Model = {
      level: 'context',
      elements: [
        { id: 'ext', type: 'system', name: 'External', external: true },
      ],
      relationships: [],
    };
    const tree = buildElementTree(model, []);
    expect(tree[0].external).toBe(true);
  });

  it('technology・descriptionを保持する', () => {
    const model: C4Model = {
      level: 'container',
      elements: [
        { id: 'db', type: 'containerDb', name: 'Database', technology: 'PostgreSQL', description: 'Stores data' },
      ],
      relationships: [],
    };
    const tree = buildElementTree(model, []);
    expect(tree[0].technology).toBe('PostgreSQL');
    expect(tree[0].description).toBe('Stores data');
  });

  it('空のモデルで空配列を返す', () => {
    const model: C4Model = { level: 'context', elements: [], relationships: [] };
    const tree = buildElementTree(model, []);
    expect(tree).toEqual([]);
  });
});
