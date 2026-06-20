// packages/mcp-trail/src/__tests__/tools/discoveryShaping.test.ts
import {
  capDependencies,
  capQueryResult,
  filterCochangePartners,
  filterCommunityNodes,
  projectCommunities,
  toSummaryRows,
} from '../../tools/discoveryShaping';

describe('capDependencies', () => {
  const raw = { node: { id: 'n' }, incoming: [1, 2, 3], outgoing: [4, 5] };

  test('limit 未満は全件・truncated=false・total を付与', () => {
    expect(capDependencies(raw, 10)).toEqual({
      node: { id: 'n' }, incoming: [1, 2, 3], outgoing: [4, 5],
      incomingTotal: 3, outgoingTotal: 2, truncated: false,
    });
  });

  test('limit 超過は切り詰め・truncated=true', () => {
    const out = capDependencies(raw, 2);
    expect(out.incoming).toEqual([1, 2]);
    expect(out.outgoing).toEqual([4, 5]);
    expect(out.incomingTotal).toBe(3);
    expect(out.truncated).toBe(true);
  });

  test('欠損フィールドは空配列・node=null', () => {
    expect(capDependencies({}, 5)).toEqual({
      node: null, incoming: [], outgoing: [],
      incomingTotal: 0, outgoingTotal: 0, truncated: false,
    });
  });
});

describe('projectCommunities', () => {
  const raw = {
    communities: [
      { communityId: 1, label: 'a', name: 'A', summary: 's', mappingsJson: '{"x":1}', stableKey: 'k1' },
    ],
  };

  test('既定 (includeMappings=false) は mappingsJson を除外', () => {
    expect(projectCommunities(raw, false)).toEqual({
      communities: [{ communityId: 1, label: 'a', name: 'A', summary: 's', stableKey: 'k1' }],
    });
  });

  test('includeMappings=true は元のまま', () => {
    expect(projectCommunities(raw, true)).toEqual(raw);
  });
});

describe('filterCommunityNodes', () => {
  const raw = {
    communities: [
      { communityId: 1, nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
      { communityId: 2, nodes: [{ id: 'd' }] },
    ],
  };

  test('communityId 指定で該当コミュニティのみ', () => {
    const out = filterCommunityNodes(raw, { communityId: 2 });
    expect(out.communities).toHaveLength(1);
    expect(out.communities[0].communityId).toBe(2);
  });

  test('nodeLimit でノードを切り詰め・nodeTotal 付与', () => {
    const out = filterCommunityNodes(raw, { communityId: 1, nodeLimit: 2 });
    expect(out.communities[0].nodes).toHaveLength(2);
    expect(out.communities[0].nodeTotal).toBe(3);
  });

  test('引数なしは全件そのまま（nodeTotal 無し）', () => {
    const out = filterCommunityNodes(raw, {});
    expect(out.communities).toHaveLength(2);
    expect(out.communities[0]).not.toHaveProperty('nodeTotal');
  });

  test('nodeLimit がノード数以上なら nodeTotal を付与しない', () => {
    const out = filterCommunityNodes(raw, { communityId: 2, nodeLimit: 5 });
    expect(out.communities[0].nodes).toHaveLength(1);
    expect(out.communities[0]).not.toHaveProperty('nodeTotal');
  });
});

describe('capQueryResult', () => {
  const raw = { nodes: ['a', 'b', 'c'], edges: [{ source: 'a', target: 'b' }] };
  test('nodes を limit で切り詰め nodeTotal/truncated を付与', () => {
    const out = capQueryResult(raw, 2);
    expect(out.nodes).toEqual(['a', 'b']);
    expect(out.nodeTotal).toBe(3);
    expect(out.truncated).toBe(true);
    expect(out.edges).toEqual([{ source: 'a', target: 'b' }]);
  });
  test('limit 以内は truncated=false', () => {
    expect(capQueryResult(raw, 10).truncated).toBe(false);
  });
  test('欠損は空配列', () => {
    expect(capQueryResult({}, 5)).toEqual({ nodes: [], edges: [], nodeTotal: 0, truncated: false });
  });
});

describe('filterCochangePartners', () => {
  const raw = {
    edges: [
      { source: 'a.ts', target: 'b.ts', jaccard: 0.9 },
      { source: 'c.ts', target: 'a.ts', jaccard: 0.5 },
      { source: 'x.ts', target: 'y.ts', jaccard: 0.8 },
    ],
  };
  test('file を含む edge のみを partner+jaccard へ射影し jaccard 降順 top_n', () => {
    expect(filterCochangePartners(raw, 'a.ts', 10)).toEqual([
      { partner: 'b.ts', jaccard: 0.9 },
      { partner: 'c.ts', jaccard: 0.5 },
    ]);
  });
  test('top_n で件数制限', () => {
    expect(filterCochangePartners(raw, 'a.ts', 1)).toEqual([{ partner: 'b.ts', jaccard: 0.9 }]);
  });
  test('該当なしは空配列', () => {
    expect(filterCochangePartners(raw, 'zzz.ts', 5)).toEqual([]);
  });
});

describe('toSummaryRows', () => {
  test('rank/filePath/importanceScore のみへ射影', () => {
    const rows = [
      { rank: 1, filePath: 'a.ts', importanceScore: 9, centralityScore: 3, signals: {}, reason: 'x' },
    ];
    expect(toSummaryRows(rows as never)).toEqual([{ rank: 1, filePath: 'a.ts', importanceScore: 9 }]);
  });
});
