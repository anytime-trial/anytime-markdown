import { splitCodeGraph, composeCodeGraph, computeStableKey } from '../codeGraph';
import type { CodeGraph } from '../codeGraph';

// テスト用のベースノード/エッジ/リポジトリ
const baseGraph: Omit<CodeGraph, 'communities' | 'communitySummaries'> = {
  generatedAt: '2026-05-02T00:00:00.000Z',
  repositories: [{ id: 'repo1', label: 'repo1', path: '/repo1' }],
  nodes: [
    {
      id: 'n1',
      label: 'NodeA',
      repo: 'repo1',
      package: 'pkg',
      fileType: 'code',
      community: 0,
      communityLabel: 'Alpha',
      x: 0,
      y: 0,
      size: 1,
    },
    {
      id: 'n2',
      label: 'NodeB',
      repo: 'repo1',
      package: 'pkg',
      fileType: 'code',
      community: 1,
      communityLabel: 'Beta',
      x: 1,
      y: 1,
      size: 2,
    },
  ],
  edges: [
    { source: 'n1', target: 'n2', confidence: 'EXTRACTED', confidence_score: 1, crossRepo: false },
  ],
  godNodes: ['n1'],
};

describe('splitCodeGraph / composeCodeGraph round-trip', () => {
  describe('(a) 要約あり - 全コミュニティに name/summary がある場合', () => {
    const full: CodeGraph = {
      ...baseGraph,
      communities: { 0: 'Alpha', 1: 'Beta' },
      communitySummaries: {
        0: { name: 'Alpha Group', summary: 'Core utilities.' },
        1: { name: 'Beta Group', summary: 'UI components.' },
      },
    };

    it('splitCodeGraph が正しい communities 配列を返す', () => {
      const { communities } = splitCodeGraph(full);
      expect(communities).toHaveLength(2);
      const c0 = communities.find((c) => c.id === 0);
      expect(c0).toEqual({
        id: 0,
        label: 'Alpha',
        name: 'Alpha Group',
        summary: 'Core utilities.',
        stableKey: computeStableKey(['n1']),
      });
      const c1 = communities.find((c) => c.id === 1);
      expect(c1).toEqual({
        id: 1,
        label: 'Beta',
        name: 'Beta Group',
        summary: 'UI components.',
        stableKey: computeStableKey(['n2']),
      });
    });

    it('stored に communities / communitySummaries が含まれない', () => {
      const { stored } = splitCodeGraph(full);
      expect(Object.keys(stored)).not.toContain('communities');
      expect(Object.keys(stored)).not.toContain('communitySummaries');
    });

    it('composeCodeGraph で元の CodeGraph と等価になる', () => {
      const { stored, communities } = splitCodeGraph(full);
      const restored = composeCodeGraph(stored, communities);
      expect(restored).toEqual(full);
    });
  });

  describe('(b) 要約なし - communitySummaries が undefined の場合', () => {
    const full: CodeGraph = {
      ...baseGraph,
      communities: { 0: 'Alpha', 1: 'Beta' },
    };

    it('splitCodeGraph の communities は name/summary が空文字列', () => {
      const { communities } = splitCodeGraph(full);
      expect(communities).toHaveLength(2);
      for (const c of communities) {
        expect(c.name).toBe('');
        expect(c.summary).toBe('');
      }
    });

    it('composeCodeGraph で communitySummaries が undefined になる', () => {
      const { stored, communities } = splitCodeGraph(full);
      const restored = composeCodeGraph(stored, communities);
      expect(restored.communitySummaries).toBeUndefined();
    });

    it('composeCodeGraph で元の CodeGraph と等価になる', () => {
      const { stored, communities } = splitCodeGraph(full);
      const restored = composeCodeGraph(stored, communities);
      expect(restored).toEqual(full);
    });
  });

  describe('(c-stableKey) computeStableKey の決定論性 / 正規化', () => {
    it('同一入力で同一キーを返す', () => {
      const ids = ['repo:packages/a/src/x.ts', 'repo:packages/a/src/y.ts'];
      expect(computeStableKey(ids)).toBe(computeStableKey(ids));
    });

    it('順序が違っても同一キーを返す（集合性）', () => {
      const a = ['repo:packages/a/src/x.ts', 'repo:packages/a/src/y.ts', 'repo:packages/a/src/z.ts'];
      const b = ['repo:packages/a/src/z.ts', 'repo:packages/a/src/x.ts', 'repo:packages/a/src/y.ts'];
      expect(computeStableKey(a)).toBe(computeStableKey(b));
    });

    it('重複入力は 1 件扱い', () => {
      const a = ['repo:packages/a/src/x.ts', 'repo:packages/a/src/y.ts'];
      const b = ['repo:packages/a/src/x.ts', 'repo:packages/a/src/y.ts', 'repo:packages/a/src/x.ts'];
      expect(computeStableKey(a)).toBe(computeStableKey(b));
    });

    it('Windows パスセパレータ（\\）と POSIX セパレータ（/）が同一キーを返す', () => {
      const win = ['repo:packages\\a\\src\\x.ts'];
      const posix = ['repo:packages/a/src/x.ts'];
      expect(computeStableKey(win)).toBe(computeStableKey(posix));
    });

    it('リポジトリ名（"<repo>:" プレフィックス）が違っても同一キーを返す', () => {
      // リネーム耐性: 同じ相対パスならリポジトリ名変更で stable_key は変わらない
      const r1 = ['repo1:packages/a/src/x.ts', 'repo1:packages/a/src/y.ts'];
      const r2 = ['repo2:packages/a/src/x.ts', 'repo2:packages/a/src/y.ts'];
      expect(computeStableKey(r1)).toBe(computeStableKey(r2));
    });

    it('NFC / NFD で同一キーを返す（Unicode 正規化）', () => {
      // U+00E9 (NFC: é, 1 codepoint) vs U+0065 U+0301 (NFD: e + 結合アクセント, 2 codepoints)
      const nfc = ['repo:packages/café/src/x.ts'];
      const nfd = ['repo:packages/café/src/x.ts'];
      expect(computeStableKey(nfc)).toBe(computeStableKey(nfd));
    });

    it('空配列で固定値を返す（バージョン prefix のハッシュ）', () => {
      // 空でもクラッシュせず決定論的に同じ値
      expect(computeStableKey([])).toBe(computeStableKey([]));
      expect(computeStableKey([]).length).toBe(16);
    });

    it('16 hex 文字列を返す', () => {
      const key = computeStableKey(['repo:packages/a/src/x.ts']);
      expect(key).toMatch(/^[0-9a-f]{16}$/);
    });

    it('異なるノード集合では異なるキーを返す', () => {
      const a = computeStableKey(['repo:packages/a/src/x.ts']);
      const b = computeStableKey(['repo:packages/a/src/y.ts']);
      expect(a).not.toBe(b);
    });
  });

  describe('(d) splitCodeGraph が stableKey をノード集合から算出する', () => {
    const full: CodeGraph = {
      ...baseGraph,
      communities: { 0: 'Alpha', 1: 'Beta' },
    };

    it('community ID ごとに、所属ノード ID 集合の stableKey を埋める', () => {
      const { communities } = splitCodeGraph(full);
      const c0 = communities.find((c) => c.id === 0);
      const c1 = communities.find((c) => c.id === 1);
      expect(c0?.stableKey).toBe(computeStableKey(['n1']));
      expect(c1?.stableKey).toBe(computeStableKey(['n2']));
      expect(c0?.stableKey).not.toBe(c1?.stableKey);
    });

    it('同じノード集合のグラフを 2 回 split したら stableKey は完全一致', () => {
      const a = splitCodeGraph(full).communities;
      const b = splitCodeGraph(full).communities;
      expect(a.map((c) => c.stableKey)).toEqual(b.map((c) => c.stableKey));
    });
  });

  describe('(e) 部分的な要約 - 一部の community_id のみ summary がある場合', () => {
    const full: CodeGraph = {
      ...baseGraph,
      communities: { 0: 'Alpha', 1: 'Beta' },
      communitySummaries: {
        0: { name: 'Alpha Group', summary: 'Core utilities.' },
        // community 1 は summary なし
      },
    };

    it('splitCodeGraph で summary なしの community は name/summary が空文字列', () => {
      const { communities } = splitCodeGraph(full);
      const c1 = communities.find((c) => c.id === 1);
      expect(c1?.name).toBe('');
      expect(c1?.summary).toBe('');
    });

    it('composeCodeGraph で summary なし community は communitySummaries に含まれない', () => {
      const { stored, communities } = splitCodeGraph(full);
      const restored = composeCodeGraph(stored, communities);
      expect(restored.communitySummaries).toBeDefined();
      expect(Object.keys(restored.communitySummaries ?? {})).toEqual(['0']);
    });

    it('composeCodeGraph で元の CodeGraph と等価になる', () => {
      const { stored, communities } = splitCodeGraph(full);
      const restored = composeCodeGraph(stored, communities);
      expect(restored).toEqual(full);
    });
  });
});
