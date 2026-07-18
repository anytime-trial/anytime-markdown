// Phase 6 S5-A: defect-risk の C4 集約が祖先 boundary まで伝播することを固定する（FR-31）。
import type { C4Model } from '@anytime-markdown/trail-core/c4';
import type { DefectRiskEntry } from '@anytime-markdown/trail-core';
import { buildDefectRiskElementMap } from '../defectRiskMap';

function makeModel(): C4Model {
  return {
    level: 'code',
    elements: [
      { id: 'pkg_trail-core', type: 'container', name: 'trail-core' },
      {
        id: 'pkg_trail-core/hotspot',
        type: 'component',
        name: 'hotspot',
        boundaryId: 'pkg_trail-core',
      },
      {
        id: 'file::packages/trail-core/src/hotspot/a.ts',
        type: 'code',
        name: 'a.ts',
        boundaryId: 'pkg_trail-core/hotspot',
      },
      {
        id: 'file::packages/trail-core/src/hotspot/b.ts',
        type: 'code',
        name: 'b.ts',
        boundaryId: 'pkg_trail-core/hotspot',
      },
    ],
    relationships: [],
  };
}

function entry(filePath: string, score: number): DefectRiskEntry {
  return { filePath, fixCount: 1, churnCount: 1, score };
}

describe('buildDefectRiskElementMap', () => {
  test('親コンポーネント・コンテナに子孫ファイルの最大リスクが伝播する', () => {
    const map = buildDefectRiskElementMap(
      [
        entry('packages/trail-core/src/hotspot/a.ts', 0.2),
        entry('packages/trail-core/src/hotspot/b.ts', 0.75),
      ],
      makeModel(),
    );

    expect(map.get('file::packages/trail-core/src/hotspot/a.ts')).toBe(0.2);
    expect(map.get('file::packages/trail-core/src/hotspot/b.ts')).toBe(0.75);
    expect(map.get('pkg_trail-core/hotspot')).toBe(0.75);
    expect(map.get('pkg_trail-core')).toBe(0.75);
  });

  test('同一要素へ複数ファイルが対応しても最大値を採る', () => {
    const map = buildDefectRiskElementMap(
      [
        entry('packages/trail-core/src/hotspot/a.ts', 0.9),
        entry('packages/trail-core/src/hotspot/a.ts', 0.1),
      ],
      makeModel(),
    );
    expect(map.get('file::packages/trail-core/src/hotspot/a.ts')).toBe(0.9);
  });

  test('モデルに対応しないファイルは空マップになる', () => {
    const map = buildDefectRiskElementMap([entry('packages/other/src/z.ts', 0.5)], makeModel());
    expect(map.size).toBe(0);
  });

  test('エントリなしは空マップ', () => {
    expect(buildDefectRiskElementMap([], makeModel()).size).toBe(0);
  });
});
