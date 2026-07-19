// Phase 6 S5-B: サーバーが返す C4 要素単位の属人度エントリを、オーバーレイ着色用へ整形する。
// 集約そのもの（要素へ写してから合算し score を再計算する）はサーバー側の責務で、
// packages/trail-server の TrailDataServer.busFactor.test.ts が検証する。
import type { BusFactorEntry } from '@anytime-markdown/trail-core';
import { busFactorEntryMap, busFactorScoreMap } from '../busFactorMap';

function entry(unitId: string, score: number | null): BusFactorEntry {
  return {
    unitId,
    totalCommits: 5,
    authorCount: 1,
    topAuthor: 'taro',
    topAuthorShare: score ?? 1,
    effectiveAuthors: 1,
    score,
  };
}

describe('busFactorEntryMap', () => {
  test('unitId で索引する', () => {
    const map = busFactorEntryMap([entry('pkg_trail-core', 0.8), entry('file::a.ts', 1)]);
    expect(map.get('pkg_trail-core')?.score).toBe(0.8);
    expect(map.get('file::a.ts')?.score).toBe(1);
  });

  test('空配列は空の Map', () => {
    expect(busFactorEntryMap([]).size).toBe(0);
  });
});

describe('busFactorScoreMap', () => {
  test('score が null の単位は着色対象から除外する', () => {
    const map = busFactorEntryMap([entry('pkg_a', 0.5), entry('pkg_b', null)]);
    const scores = busFactorScoreMap(map);
    expect(scores.get('pkg_a')).toBe(0.5);
    expect(scores.has('pkg_b')).toBe(false);
  });
});
