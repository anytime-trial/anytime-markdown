// Phase 6 S5-A: C4 祖先 rollup の共有関数。
// hotspot 内部にあった非 export 実装を昇格したもので、defect-risk からも使う。
import { buildAncestorChain, rollupMaxToAncestors } from '../rollup';
import type { C4Model } from '../types';

function makeModel(): C4Model {
  return {
    level: 'code',
    elements: [
      { id: 'sys', type: 'system', name: 'Sys' },
      { id: 'pkg_core', type: 'container', name: 'Core', boundaryId: 'sys' },
      { id: 'pkg_core/x', type: 'component', name: 'X', boundaryId: 'pkg_core' },
      { id: 'file::x/a.ts', type: 'code', name: 'a.ts', boundaryId: 'pkg_core/x' },
      { id: 'file::x/b.ts', type: 'code', name: 'b.ts', boundaryId: 'pkg_core/x' },
      { id: 'orphan', type: 'code', name: 'orphan.ts' },
    ],
    relationships: [],
  };
}

describe('buildAncestorChain', () => {
  test('自身から祖先まで順に返す', () => {
    const elementById = new Map(makeModel().elements.map((el) => [el.id, el] as const));
    expect(buildAncestorChain(elementById, 'file::x/a.ts')).toEqual([
      'file::x/a.ts',
      'pkg_core/x',
      'pkg_core',
      'sys',
    ]);
  });

  test('boundaryId の循環でも無限ループしない', () => {
    const elementById = new Map([
      ['a', { id: 'a', type: 'code', name: 'a', boundaryId: 'b' }],
      ['b', { id: 'b', type: 'code', name: 'b', boundaryId: 'a' }],
    ] as const);
    expect(buildAncestorChain(elementById, 'a')).toEqual(['a', 'b']);
  });
});

describe('rollupMaxToAncestors', () => {
  test('多段の boundary チェーンへ最大値を伝播する', () => {
    const base = new Map([
      ['file::x/a.ts', 0.4],
      ['file::x/b.ts', 0.9],
    ]);
    const result = rollupMaxToAncestors(base, makeModel());
    expect(result.get('file::x/a.ts')).toBe(0.4);
    expect(result.get('file::x/b.ts')).toBe(0.9);
    // 親・祖父・システムまで子孫の最大値が伝播する
    expect(result.get('pkg_core/x')).toBe(0.9);
    expect(result.get('pkg_core')).toBe(0.9);
    expect(result.get('sys')).toBe(0.9);
  });

  test('親要素に直接値がある場合は子孫の最大値と比較して大きい方を採る', () => {
    const base = new Map([
      ['pkg_core/x', 0.8],
      ['file::x/a.ts', 0.2],
    ]);
    const result = rollupMaxToAncestors(base, makeModel());
    expect(result.get('pkg_core/x')).toBe(0.8);
    expect(result.get('pkg_core')).toBe(0.8);
  });

  test('boundaryId を持たない孤立要素は自身のみに値が入る', () => {
    const result = rollupMaxToAncestors(new Map([['orphan', 0.5]]), makeModel());
    expect(result.get('orphan')).toBe(0.5);
    expect(result.size).toBe(1);
  });

  test('モデルに存在しない ID は無視する', () => {
    const result = rollupMaxToAncestors(new Map([['file::unknown.ts', 1]]), makeModel());
    expect(result.size).toBe(0);
  });

  test('値 0 でも祖先へ伝播し、既存の大きい値を下げない', () => {
    const base = new Map([
      ['file::x/a.ts', 0],
      ['file::x/b.ts', 0.3],
    ]);
    const result = rollupMaxToAncestors(base, makeModel());
    expect(result.get('file::x/a.ts')).toBe(0);
    expect(result.get('pkg_core/x')).toBe(0.3);
  });
});
