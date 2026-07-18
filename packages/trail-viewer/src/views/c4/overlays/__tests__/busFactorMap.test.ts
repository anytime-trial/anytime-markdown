// Phase 6 S5-B: C4 要素単位の属人度集約（FR-30 の土台）。
import type { FileAuthorCommitRow } from '@anytime-markdown/trail-core';
import type { C4Model } from '@anytime-markdown/trail-core/c4';
import { buildBusFactorElementMap, busFactorScoreMap } from '../busFactorMap';

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

/** 非 truncate 前提のテストで null を弾く */
function requireMap<T>(map: T | null): T {
  if (map === null) throw new Error('expected non-null bus factor map');
  return map;
}

function row(filePath: string, author: string, commitHash: string): FileAuthorCommitRow {
  return { filePath, author, commitHash };
}

describe('buildBusFactorElementMap', () => {
  test('1 コミットが同一要素内の複数ファイルを触っても 1 コミットとして数える', () => {
    const map = requireMap(buildBusFactorElementMap(
      [
        row('packages/trail-core/src/hotspot/a.ts', 'taro', 'c1'),
        row('packages/trail-core/src/hotspot/b.ts', 'taro', 'c1'),
      ],
      makeModel(),
      1,
    ));
    expect(map.get('pkg_trail-core/hotspot')?.totalCommits).toBe(1);
    expect(map.get('pkg_trail-core')?.totalCommits).toBe(1);
  });

  test('要素へ写してから合算するため、ファイル単位では単独著者でも要素では複数著者になる', () => {
    const map = requireMap(buildBusFactorElementMap(
      [
        row('packages/trail-core/src/hotspot/a.ts', 'taro', 'c1'),
        row('packages/trail-core/src/hotspot/a.ts', 'taro', 'c2'),
        row('packages/trail-core/src/hotspot/b.ts', 'hanako', 'c3'),
        row('packages/trail-core/src/hotspot/b.ts', 'hanako', 'c4'),
      ],
      makeModel(),
      2,
    ));
    // ファイル要素はそれぞれ単独著者
    expect(map.get('file::packages/trail-core/src/hotspot/a.ts')?.score).toBe(1);
    // 束ねた親コンポーネントでは 2 著者・0.5
    const comp = map.get('pkg_trail-core/hotspot');
    expect(comp?.authorCount).toBe(2);
    expect(comp?.score).toBeCloseTo(0.5, 6);
  });

  test('minCommits 未満の要素は score が null', () => {
    const map = requireMap(buildBusFactorElementMap(
      [row('packages/trail-core/src/hotspot/a.ts', 'taro', 'c1')],
      makeModel(),
      5,
    ));
    expect(map.get('pkg_trail-core/hotspot')?.score).toBeNull();
  });

  test('モデルに対応しないファイルは集計されない', () => {
    const map = requireMap(buildBusFactorElementMap([row('packages/other/z.ts', 'taro', 'c1')], makeModel(), 1));
    expect(map.size).toBe(0);
  });
});

describe('rowsTruncated', () => {
  test('生行が切り詰められている場合は集計せず null（誤った属人度を出さない・cross-review 指摘）', () => {
    const map = buildBusFactorElementMap(
      [row('packages/trail-core/src/hotspot/a.ts', 'taro', 'c1')],
      makeModel(),
      1,
      true,
    );
    expect(map).toBeNull();
  });

  test('切り詰められていなければ従来どおり集計する', () => {
    const map = buildBusFactorElementMap(
      [row('packages/trail-core/src/hotspot/a.ts', 'taro', 'c1')],
      makeModel(),
      1,
      false,
    );
    expect(map).not.toBeNull();
  });
});

describe('busFactorScoreMap', () => {
  test('score が null の単位は着色対象から除外する', () => {
    const map = requireMap(buildBusFactorElementMap(
      [
        row('packages/trail-core/src/hotspot/a.ts', 'taro', 'c1'),
        row('packages/trail-core/src/hotspot/a.ts', 'taro', 'c2'),
      ],
      makeModel(),
      2,
    ));
    const scores = busFactorScoreMap(map);
    expect(scores.get('pkg_trail-core/hotspot')).toBe(1);

    const sparse = requireMap(
      buildBusFactorElementMap([row('packages/trail-core/src/hotspot/a.ts', 'taro', 'c1')], makeModel(), 5),
    );
    expect(busFactorScoreMap(sparse).size).toBe(0);
  });
});
