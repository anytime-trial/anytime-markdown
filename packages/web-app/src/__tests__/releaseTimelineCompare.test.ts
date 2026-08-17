import { compareOrdinal } from '../lib/releaseTimeline/compare';

describe('compareOrdinal', () => {
  it('コードユニット順で比較する', () => {
    expect(compareOrdinal('2026-02', '2026-10')).toBeLessThan(0);
    expect(compareOrdinal('2026-10', '2026-02')).toBeGreaterThan(0);
    expect(compareOrdinal('2026-07', '2026-07')).toBe(0);
  });

  it('等しい要素に 0 を返す（比較関数の全順序契約を満たす）', () => {
    // 「等しくないなら 1」で済ませる比較関数は等値で 1 を返し、実装依存の入れ替えを招く
    const ids = ['cli-2.0.0', 'cli-2.0.0'];
    expect(compareOrdinal(ids[0], ids[1])).toBe(0);
  });

  it('localeCompare と違ってロケールに依存しない順序を返す', () => {
    // 大小文字混在は序数と辞書順が食い違う代表例。ここが localeCompare へ差し替わると
    // 同じ入力から生成した年表・診断結果が実行環境ごとに別物になる
    const input = ['b-release', 'A-release', 'a-release', 'B-release'];

    expect([...input].sort(compareOrdinal)).toEqual([
      'A-release',
      'B-release',
      'a-release',
      'b-release',
    ]);
    expect([...input].sort(compareOrdinal)).not.toEqual(
      [...input].sort((x, y) => x.localeCompare(y))
    );
  });
});
