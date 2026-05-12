import { resolveCarryOver, jaccardSimilarity } from '../communityCarryOver';
import type { OldCommunity, NewCommunity } from '../communityCarryOver';

function oldC(p: Partial<OldCommunity> & { communityId: number }): OldCommunity {
  return {
    communityId: p.communityId,
    stableKey: p.stableKey ?? '',
    members: p.members ?? new Set(),
    name: p.name ?? '',
    summary: p.summary ?? '',
    mappingsJson: p.mappingsJson ?? null,
  };
}

function newC(p: Partial<NewCommunity> & { id: number }): NewCommunity {
  return {
    id: p.id,
    stableKey: p.stableKey ?? '',
    members: p.members ?? new Set(),
  };
}

describe('jaccardSimilarity', () => {
  it('一致なし: 0', () => {
    expect(jaccardSimilarity(new Set(['a']), new Set(['b']))).toBe(0);
  });

  it('完全一致: 1', () => {
    expect(jaccardSimilarity(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1);
  });

  it('半分一致: 1/3', () => {
    // {a, b} と {a, c} → 共通 {a}, 和 {a, b, c} → 1/3
    expect(jaccardSimilarity(new Set(['a', 'b']), new Set(['a', 'c']))).toBeCloseTo(1 / 3, 6);
  });

  it('両方空: 0（未定義のため）', () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(0);
  });

  it('片方空: 0', () => {
    expect(jaccardSimilarity(new Set(['a']), new Set())).toBe(0);
  });
});

describe('resolveCarryOver', () => {
  describe('Step 1: stable_key 完全一致', () => {
    it('同じ stableKey の新コミュニティに name / summary / mappings を継承する', () => {
      const olds = [
        oldC({
          communityId: 0,
          stableKey: 'aaa',
          members: new Set(['n1', 'n2']),
          name: 'カバレッジ計算',
          summary: '...',
          mappingsJson: '[{"elementId":"pkg_x/y","elementType":"component","role":"primary"}]',
        }),
      ];
      const news = [newC({ id: 7, stableKey: 'aaa', members: new Set(['n1', 'n2']) })];
      const result = resolveCarryOver(olds, news);
      expect(result.get(7)).toEqual({
        name: 'カバレッジ計算',
        summary: '...',
        mappingsJson: '[{"elementId":"pkg_x/y","elementType":"component","role":"primary"}]',
        source: 'exact',
        similarity: 1,
      });
    });

    it('community_id が再採番されても stableKey 一致で継承される', () => {
      // 旧 community_id=3 だったコミュニティが 新 community_id=11 に振り直されても、
      // ノード集合が同じなら stableKey は同じ → 継承される
      const olds = [oldC({ communityId: 3, stableKey: 'kkk', members: new Set(['a']), name: 'X' })];
      const news = [newC({ id: 11, stableKey: 'kkk', members: new Set(['a']) })];
      expect(resolveCarryOver(olds, news).get(11)?.name).toBe('X');
    });

    it('stableKey が空文字（古いスキーマ）の場合は exact マッチに使わない', () => {
      const olds = [oldC({ communityId: 0, stableKey: '', members: new Set(['n']), name: 'X' })];
      const news = [newC({ id: 0, stableKey: '', members: new Set(['n']) })];
      const result = resolveCarryOver(olds, news);
      // members 一致なのでジャッカード fallback で継承される（exact ではなく jaccard）
      expect(result.get(0)?.source).toBe('jaccard');
      expect(result.get(0)?.name).toBe('X');
    });
  });

  describe('Step 2: ジャッカード fallback', () => {
    it('閾値 0.7 以上で継承する（1 ノード追加で 2/3）→ 継承しない', () => {
      const olds = [oldC({ communityId: 0, stableKey: 'k1', members: new Set(['a', 'b']), name: 'X' })];
      const news = [newC({ id: 0, stableKey: 'k2', members: new Set(['a', 'b', 'c']) })];
      // jaccard = 2/3 ≈ 0.667 < 0.7
      expect(resolveCarryOver(olds, news).has(0)).toBe(false);
    });

    it('閾値 0.7 以上で継承する（3/4 = 0.75）→ 継承する', () => {
      const olds = [oldC({ communityId: 0, stableKey: 'k1', members: new Set(['a', 'b', 'c']), name: 'X' })];
      const news = [newC({ id: 5, stableKey: 'k2', members: new Set(['a', 'b', 'c', 'd']) })];
      // jaccard = 3/4 = 0.75 ≥ 0.7
      const result = resolveCarryOver(olds, news);
      expect(result.get(5)?.name).toBe('X');
      expect(result.get(5)?.source).toBe('jaccard');
      expect(result.get(5)?.similarity).toBeCloseTo(0.75, 6);
    });

    it('閾値をオプションで下げると 0.5 でも継承する', () => {
      const olds = [oldC({ communityId: 0, stableKey: 'k1', members: new Set(['a', 'b']), name: 'X' })];
      const news = [newC({ id: 0, stableKey: 'k2', members: new Set(['a', 'b', 'c', 'd']) })];
      // jaccard = 2/4 = 0.5
      const result = resolveCarryOver(olds, news, { jaccardThreshold: 0.5 });
      expect(result.get(0)?.name).toBe('X');
    });

    it('1 つの旧が 2 つの新に類似する場合、最も類似度の高い方に引き継ぐ', () => {
      const olds = [oldC({ communityId: 0, stableKey: 'k0', members: new Set(['a', 'b', 'c']), name: 'X' })];
      const news = [
        newC({ id: 1, stableKey: 'k1', members: new Set(['a', 'b']) }),         // jaccard 2/3 ≈ 0.667
        newC({ id: 2, stableKey: 'k2', members: new Set(['a', 'b', 'c', 'd']) }),// jaccard 3/4 = 0.75
      ];
      const result = resolveCarryOver(olds, news);
      expect(result.get(2)?.name).toBe('X');
      expect(result.has(1)).toBe(false);
    });

    it('2 つの旧が 1 つの新に類似する場合、より類似度の高い方が勝つ', () => {
      const olds = [
        oldC({ communityId: 0, stableKey: 'k0', members: new Set(['a', 'b']), name: 'X' }),         // vs new {a,b,c,d} → 2/4=0.5
        oldC({ communityId: 1, stableKey: 'k1', members: new Set(['a', 'b', 'c']), name: 'Y' }),    // vs new {a,b,c,d} → 3/4=0.75
      ];
      const news = [newC({ id: 99, stableKey: 'k99', members: new Set(['a', 'b', 'c', 'd']) })];
      const result = resolveCarryOver(olds, news, { jaccardThreshold: 0.5 });
      // Y のほうが類似度 0.75 で高い
      expect(result.get(99)?.name).toBe('Y');
    });
  });

  describe('境界ケース', () => {
    it('旧が無ければ空の Map を返す', () => {
      const result = resolveCarryOver([], [newC({ id: 0, stableKey: 'k', members: new Set(['a']) })]);
      expect(result.size).toBe(0);
    });

    it('新が無ければ空の Map を返す', () => {
      const result = resolveCarryOver([oldC({ communityId: 0, stableKey: 'k', members: new Set(['a']) })], []);
      expect(result.size).toBe(0);
    });

    it('exact が優先される（exact と jaccard 候補が両方ある場合）', () => {
      const olds = [
        oldC({ communityId: 0, stableKey: 'exact-key', members: new Set(['a']), name: 'EXACT' }),
        oldC({ communityId: 1, stableKey: 'other-key', members: new Set(['a', 'b']), name: 'JACCARD' }),
      ];
      const news = [newC({ id: 0, stableKey: 'exact-key', members: new Set(['a']) })];
      const result = resolveCarryOver(olds, news);
      // 同じ new id=0 に対して exact (members={a}) と jaccard (members={a,b} jaccard=0.5) の候補があるが、
      // exact が先に決まるので jaccard は試行されない
      expect(result.get(0)?.source).toBe('exact');
      expect(result.get(0)?.name).toBe('EXACT');
    });
  });
});
