import { reciprocalRankFusion } from '../../src/rag/reciprocalRankFusion';

describe('reciprocalRankFusion', () => {
  test('両リストに登場する id がトップに来る', () => {
    const bm25 = [
      { id: 'a', rank: 0 },
      { id: 'b', rank: 1 },
    ];
    const vec = [
      { id: 'a', rank: 0 },
      { id: 'c', rank: 1 },
    ];
    const r = reciprocalRankFusion(bm25, vec, 60);
    expect(r[0].id).toBe('a');
    expect([...r[0].sources].sort()).toEqual(['bm25', 'vec']);
  });

  test('スコア計算は 1 / (k + rank) の和', () => {
    const bm25 = [{ id: 'a', rank: 0 }];
    const vec = [{ id: 'a', rank: 1 }];
    const r = reciprocalRankFusion(bm25, vec, 60);
    expect(r[0].score).toBeCloseTo(1 / 60 + 1 / 61, 8);
  });

  test('片方のみのリストでも動作', () => {
    const r = reciprocalRankFusion([{ id: 'a', rank: 0 }], [], 60);
    expect(r).toEqual([{ id: 'a', score: 1 / 60, sources: ['bm25'] }]);
  });

  test('空入力は空配列', () => {
    expect(reciprocalRankFusion([], [], 60)).toEqual([]);
  });

  test('複数 id でランクに応じて降順ソート', () => {
    const bm25 = [
      { id: 'a', rank: 0 },
      { id: 'b', rank: 5 },
    ];
    const vec = [{ id: 'c', rank: 0 }];
    const r = reciprocalRankFusion(bm25, vec, 60);
    expect(r.map((x) => x.id)).toEqual(['a', 'c', 'b']);
  });

  test('k 値を変えると順位差が変化する', () => {
    const bm25 = [{ id: 'a', rank: 0 }];
    const vec = [{ id: 'a', rank: 99 }];
    const r1 = reciprocalRankFusion(bm25, vec, 1);
    const r2 = reciprocalRankFusion(bm25, vec, 1000);
    expect(r1[0].score).toBeGreaterThan(r2[0].score);
  });
});
