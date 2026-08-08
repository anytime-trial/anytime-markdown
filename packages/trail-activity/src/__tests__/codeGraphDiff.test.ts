import { diffCodeGraphs } from '../codeGraphDiff';
import type { CodeGraph, CodeGraphEdge, CodeGraphNode } from '../codeGraph';

function node(id: string, over: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return {
    id,
    label: id,
    repo: 'r',
    package: 'p',
    fileType: 'code',
    community: 0,
    communityLabel: 'c0',
    x: 0,
    y: 0,
    size: 1,
    ...over,
  };
}

function edge(source: string, target: string, over: Partial<CodeGraphEdge> = {}): CodeGraphEdge {
  return { source, target, confidence: 'EXTRACTED', confidence_score: 1, crossRepo: false, ...over };
}

function graph(nodes: CodeGraphNode[], edges: CodeGraphEdge[]): CodeGraph {
  return {
    generatedAt: '2026-08-04T00:00:00.000Z',
    repositories: [],
    nodes,
    edges,
    communities: {},
    godNodes: [],
  };
}

describe('diffCodeGraphs', () => {
  it('classifies a node absent from the baseline as added', () => {
    const baseline = graph([node('a')], []);
    const target = graph([node('a'), node('b')], []);

    const diff = diffCodeGraphs(baseline, target);

    expect(diff.status.get('b')).toBe('added');
    expect(diff.addedNodeIds).toEqual(['b']);
  });

  it('classifies a node absent from the target as removed and keeps the baseline node for ghosting', () => {
    const baseline = graph([node('a'), node('gone', { x: 12, y: 34 })], []);
    const target = graph([node('a')], []);

    const diff = diffCodeGraphs(baseline, target);

    expect(diff.status.get('gone')).toBe('removed');
    // ゴースト描画はベースラインの座標を借りるため、ノード実体ごと返す必要がある。
    expect(diff.removedNodes).toEqual([expect.objectContaining({ id: 'gone', x: 12, y: 34 })]);
  });

  it('classifies a node whose outgoing edges changed as changed', () => {
    const baseline = graph([node('a'), node('b'), node('c')], [edge('a', 'b')]);
    const target = graph([node('a'), node('b'), node('c')], [edge('a', 'c')]);

    const diff = diffCodeGraphs(baseline, target);

    expect(diff.status.get('a')).toBe('changed');
  });

  it('classifies a node whose incoming edges changed as changed', () => {
    const baseline = graph([node('a'), node('b'), node('c')], [edge('a', 'c')]);
    const target = graph([node('a'), node('b'), node('c')], [edge('b', 'c')]);

    const diff = diffCodeGraphs(baseline, target);

    expect(diff.status.get('c')).toBe('changed');
  });

  it('treats edge direction as significant', () => {
    const baseline = graph([node('a'), node('b')], [edge('a', 'b')]);
    const target = graph([node('a'), node('b')], [edge('b', 'a')]);

    const diff = diffCodeGraphs(baseline, target);

    expect(diff.status.get('a')).toBe('changed');
    expect(diff.status.get('b')).toBe('changed');
  });

  it('classifies a node with an identical edge set as unchanged', () => {
    const baseline = graph([node('a'), node('b')], [edge('a', 'b')]);
    const target = graph([node('a'), node('b')], [edge('a', 'b')]);

    const diff = diffCodeGraphs(baseline, target);

    expect(diff.status.get('a')).toBe('unchanged');
    expect(diff.status.get('b')).toBe('unchanged');
  });

  // 実測（2026-08-04・v1.18.0 → v1.19.1）: 共通 2072 ノードのうち座標は 2072 件（100%）、
  // community は 1366 件（66%）が変化する。これらを判定に使うと全ノードが changed になる。
  it('ignores layout coordinates, community and size when classifying', () => {
    const baseline = graph(
      [node('a', { x: 0, y: 0, community: 1, communityLabel: 'c1', size: 1 }), node('b')],
      [edge('a', 'b')],
    );
    const target = graph(
      [node('a', { x: 999, y: -999, community: 7, communityLabel: 'c7', size: 42 }), node('b')],
      [edge('a', 'b')],
    );

    const diff = diffCodeGraphs(baseline, target);

    expect(diff.status.get('a')).toBe('unchanged');
    expect(diff.counts.changed).toBe(0);
  });

  it('reports added and removed edges', () => {
    const baseline = graph([node('a'), node('b'), node('c')], [edge('a', 'b')]);
    const target = graph([node('a'), node('b'), node('c')], [edge('b', 'c')]);

    const diff = diffCodeGraphs(baseline, target);

    expect(diff.addedEdges).toEqual([expect.objectContaining({ source: 'b', target: 'c' })]);
    expect(diff.removedEdges).toEqual([expect.objectContaining({ source: 'a', target: 'b' })]);
  });

  // confidence / confidence_score は解析実行ごとに揺れる推定値なので差分に数えない。
  it('ignores confidence changes on an otherwise identical edge', () => {
    const baseline = graph(
      [node('a'), node('b')],
      [edge('a', 'b', { confidence: 'EXTRACTED', confidence_score: 1 })],
    );
    const target = graph(
      [node('a'), node('b')],
      [edge('a', 'b', { confidence: 'AMBIGUOUS', confidence_score: 0.2 })],
    );

    const diff = diffCodeGraphs(baseline, target);

    expect(diff.addedEdges).toEqual([]);
    expect(diff.removedEdges).toEqual([]);
    expect(diff.status.get('a')).toBe('unchanged');
  });

  it('counts each classification', () => {
    const baseline = graph([node('keep'), node('touch'), node('gone')], [edge('touch', 'gone')]);
    const target = graph([node('keep'), node('touch'), node('fresh')], [edge('touch', 'fresh')]);

    const diff = diffCodeGraphs(baseline, target);

    expect(diff.counts).toEqual({ added: 1, removed: 1, changed: 1, unchanged: 1 });
  });

  it('returns empty results for two empty graphs', () => {
    const diff = diffCodeGraphs(graph([], []), graph([], []));

    expect(diff.counts).toEqual({ added: 0, removed: 0, changed: 0, unchanged: 0 });
    expect(diff.removedNodes).toEqual([]);
  });

  it('does not classify removed nodes as changed even when their edges disappear', () => {
    const baseline = graph([node('a'), node('gone')], [edge('a', 'gone')]);
    const target = graph([node('a')], []);

    const diff = diffCodeGraphs(baseline, target);

    expect(diff.status.get('gone')).toBe('removed');
    // 'a' は gone への辺を失っているので changed。removed に巻き込まない。
    expect(diff.status.get('a')).toBe('changed');
    expect(diff.counts).toEqual({ added: 0, removed: 1, changed: 1, unchanged: 0 });
  });
});
