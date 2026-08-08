import type { DsmMatrix } from '../types';
import type { C4Element } from '../../types';
import {
  aggregateDsmToPackageLevel,
  aggregateDsmToC4CodeLevel,
  aggregateDsmToC4ComponentLevel,
  aggregateDsmToC4ContainerLevel,
  aggregateDsmToC4SystemLevel,
  sortDsmMatrixByName,
  filterDsmMatrix,
} from '../aggregateDsm';

function makeMatrix(
  nodes: Array<{ id: string; path: string }>,
  adj: number[][],
): DsmMatrix {
  return {
    nodes: nodes.map(n => ({ id: n.id, name: n.id, path: n.path, level: 'component' as const })),
    edges: [],
    adjacency: adj,
  };
}

describe('aggregateDsmToPackageLevel', () => {
  it('空の行列はそのまま返す', () => {
    const m = makeMatrix([], []);
    expect(aggregateDsmToPackageLevel(m)).toBe(m);
  });

  it('すでに package レベルの場合はそのまま返す', () => {
    const m: DsmMatrix = {
      nodes: [{ id: 'a', name: 'a', path: 'a', level: 'package' }],
      edges: [],
      adjacency: [[0]],
    };
    expect(aggregateDsmToPackageLevel(m)).toBe(m);
  });

  it('同一ディレクトリのファイルを1つのパッケージに集約する', () => {
    const m = makeMatrix(
      [
        { id: 'a/f1.ts', path: 'a/f1.ts' },
        { id: 'a/f2.ts', path: 'a/f2.ts' },
        { id: 'b/f3.ts', path: 'b/f3.ts' },
      ],
      [
        [0, 1, 0],
        [0, 0, 1],
        [0, 0, 0],
      ],
    );
    const result = aggregateDsmToPackageLevel(m);
    expect(result.nodes).toHaveLength(2);
    const names = result.nodes.map(n => n.path);
    expect(names).toContain('a');
    expect(names).toContain('b');
    // a→b の依存が集約される
    const ai = names.indexOf('a');
    const bi = names.indexOf('b');
    expect(result.adjacency[ai][bi]).toBe(1);
    // 自己参照はない
    expect(result.adjacency[ai][ai]).toBe(0);
    expect(result.adjacency[bi][bi]).toBe(0);
  });

  it('パッケージ内の依存は集約後に自己参照にならない', () => {
    const m = makeMatrix(
      [
        { id: 'pkg/a.ts', path: 'pkg/a.ts' },
        { id: 'pkg/b.ts', path: 'pkg/b.ts' },
      ],
      [
        [0, 1],
        [0, 0],
      ],
    );
    const result = aggregateDsmToPackageLevel(m);
    expect(result.nodes).toHaveLength(1);
    expect(result.adjacency[0][0]).toBe(0);
  });
});

describe('aggregateDsmByC4Ancestors (via exported functions)', () => {
  const elements: C4Element[] = [
    { id: 'sys1', type: 'system', name: 'System1' },
    { id: 'cont1', type: 'container', name: 'Container1', boundaryId: 'sys1' },
    { id: 'comp1', type: 'component', name: 'Component1', boundaryId: 'cont1' },
    { id: 'code1', type: 'code', name: 'file1.ts', boundaryId: 'comp1' },
    { id: 'code2', type: 'code', name: 'file2.ts', boundaryId: 'comp1' },
    { id: 'comp2', type: 'component', name: 'Component2', boundaryId: 'cont1' },
    { id: 'code3', type: 'code', name: 'file3.ts', boundaryId: 'comp2' },
  ];

  it('aggregateDsmToC4CodeLevel: code 要素単位に集約', () => {
    const m = makeMatrix(
      [
        { id: 'code1', path: 'code1' },
        { id: 'code2', path: 'code2' },
        { id: 'code3', path: 'code3' },
      ],
      [
        [0, 1, 0],
        [0, 0, 1],
        [0, 0, 0],
      ],
    );
    const result = aggregateDsmToC4CodeLevel(m, elements);
    expect(result.nodes).toHaveLength(3);
    const ids = result.nodes.map(n => n.id);
    expect(ids).toContain('code1');
    expect(ids).toContain('code2');
    expect(ids).toContain('code3');
  });

  it('aggregateDsmToC4ComponentLevel: component 単位に集約', () => {
    const m = makeMatrix(
      [
        { id: 'code1', path: 'code1' },
        { id: 'code2', path: 'code2' },
        { id: 'code3', path: 'code3' },
      ],
      [
        [0, 0, 1],
        [0, 0, 1],
        [0, 0, 0],
      ],
    );
    const result = aggregateDsmToC4ComponentLevel(m, elements);
    // code1,code2はcomp1に属し、code3はcomp2に属する
    expect(result.nodes).toHaveLength(2);
    const names = result.nodes.map(n => n.name);
    expect(names).toContain('Component1');
    expect(names).toContain('Component2');
    // comp1→comp2 の依存
    const c1i = result.nodes.findIndex(n => n.name === 'Component1');
    const c2i = result.nodes.findIndex(n => n.name === 'Component2');
    expect(result.adjacency[c1i][c2i]).toBe(1);
    // 逆は0
    expect(result.adjacency[c2i][c1i]).toBe(0);
    // 自己参照なし
    expect(result.adjacency[c1i][c1i]).toBe(0);
  });

  it('aggregateDsmToC4ContainerLevel: container 単位に集約', () => {
    const m = makeMatrix(
      [
        { id: 'code1', path: 'code1' },
        { id: 'code3', path: 'code3' },
      ],
      [
        [0, 1],
        [0, 0],
      ],
    );
    const result = aggregateDsmToC4ContainerLevel(m, elements);
    // code1→cont1, code3→cont1 どちらも同じコンテナなので自己参照扱いで0
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].name).toBe('Container1');
    expect(result.adjacency[0][0]).toBe(0);
  });

  it('aggregateDsmToC4SystemLevel: system 単位に集約', () => {
    const m = makeMatrix(
      [
        { id: 'code1', path: 'code1' },
        { id: 'code3', path: 'code3' },
      ],
      [
        [0, 1],
        [0, 0],
      ],
    );
    const result = aggregateDsmToC4SystemLevel(m, elements);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].name).toBe('System1');
  });

  it('C4 に対応する祖先がないノードは集約対象外（ノードに含まれない）', () => {
    const m = makeMatrix(
      [
        { id: 'orphan', path: 'orphan' },
        { id: 'code1', path: 'code1' },
      ],
      [
        [0, 1],
        [0, 0],
      ],
    );
    const result = aggregateDsmToC4ComponentLevel(m, elements);
    // orphan は component 祖先なし → 除外される
    const ids = result.nodes.map(n => n.id);
    expect(ids).not.toContain('orphan');
    expect(ids).toContain('comp1');
  });
});

describe('sortDsmMatrixByName', () => {
  it('空行列をそのまま返す', () => {
    const m = makeMatrix([], []);
    expect(sortDsmMatrixByName(m)).toBe(m);
  });

  it('ノードを path 昇順にソートし隣接行列も整合させる', () => {
    const m = makeMatrix(
      [
        { id: 'b/x.ts', path: 'b/x.ts' },
        { id: 'a/y.ts', path: 'a/y.ts' },
      ],
      [
        [0, 1],
        [0, 0],
      ],
    );
    const result = sortDsmMatrixByName(m);
    expect(result.nodes[0].path).toBe('a/y.ts');
    expect(result.nodes[1].path).toBe('b/x.ts');
    // b→a の依存が再マッピングされ [1][0]=1
    expect(result.adjacency[1][0]).toBe(1);
    expect(result.adjacency[0][1]).toBe(0);
  });
});

describe('filterDsmMatrix', () => {
  it('指定IDのみのノードと隣接行列を返す', () => {
    const m = makeMatrix(
      [
        { id: 'a', path: 'a' },
        { id: 'b', path: 'b' },
        { id: 'c', path: 'c' },
      ],
      [
        [0, 1, 0],
        [0, 0, 1],
        [0, 0, 0],
      ],
    );
    const result = filterDsmMatrix(m, new Set(['a', 'c']));
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes.map(n => n.id)).toEqual(['a', 'c']);
    // a→c は元は間接的（a→b→c）。直接依存なし → 0
    expect(result.adjacency).toEqual([[0, 0], [0, 0]]);
  });
});
