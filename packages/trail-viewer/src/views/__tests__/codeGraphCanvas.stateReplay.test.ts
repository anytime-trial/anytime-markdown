import type { CodeGraph, CodeGraphNode } from '@anytime-markdown/trail-core/codeGraph';
import { diffCodeGraphs } from '@anytime-markdown/trail-core/codeGraphDiff';
import {
  buildSigmaGraph,
  needsGraphRebuild,
  type CodeGraphCanvasViewProps,
} from '../codeGraphSigmaGraph';
import { diffNodeColor } from '../stateReplayColors';
import { communityColor } from '../../components/communityColors';

function node(id: string, over: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return {
    id,
    label: id,
    repo: 'r',
    package: 'p',
    fileType: 'code',
    community: 0,
    communityLabel: 'c',
    x: 0,
    y: 0,
    size: 1,
    ...over,
  };
}

function graph(nodes: CodeGraphNode[], edges: Array<[string, string]>): CodeGraph {
  return {
    generatedAt: '2026-08-04T00:00:00.000Z',
    repositories: [{ id: 'r', label: 'r', path: '/tmp/r' }],
    nodes,
    edges: edges.map(([source, target]) => ({
      source,
      target,
      confidence: 'EXTRACTED' as const,
      confidence_score: 1,
      crossRepo: false,
    })),
    communities: { 0: 'c' },
    godNodes: [],
  };
}

// ベースライン: keep / touch / gone。対象: keep / touch / fresh。
const baseline = graph(
  [node('keep'), node('touch'), node('gone', { x: 11, y: 22, label: 'gone' })],
  [['touch', 'gone']],
);
const target = graph([node('keep'), node('touch'), node('fresh')], [['touch', 'fresh']]);

// 同一性で比較する箇所（needsGraphRebuild）があるため、差分は 1 度だけ作って使い回す。
const DIFF = diffCodeGraphs(baseline, target);

function props(over: Partial<CodeGraphCanvasViewProps> = {}): CodeGraphCanvasViewProps {
  return {
    graph: target,
    colorBy: 'diff',
    isDark: true,
    diff: DIFF,
    ...over,
  };
}

describe('buildSigmaGraph — State Replay (colorBy: diff)', () => {
  it('colours added / changed / unchanged nodes by their diff status', () => {
    const { g } = buildSigmaGraph(props());

    expect(g.getNodeAttribute('fresh', 'color')).toBe(diffNodeColor('added', true));
    expect(g.getNodeAttribute('touch', 'color')).toBe(diffNodeColor('changed', true));
    expect(g.getNodeAttribute('keep', 'color')).toBe(diffNodeColor('unchanged', true));
  });

  it('adds removed nodes as ghosts using the baseline coordinates', () => {
    const { g } = buildSigmaGraph(props());

    expect(g.hasNode('gone')).toBe(true);
    expect(g.getNodeAttribute('gone', 'color')).toBe(diffNodeColor('removed', true));
    expect(g.getNodeAttribute('gone', 'x')).toBe(11);
    expect(g.getNodeAttribute('gone', 'y')).toBe(22);
  });

  it('omits removed nodes when showRemovedNodes is false', () => {
    const { g } = buildSigmaGraph(props({ showRemovedNodes: false }));

    expect(g.hasNode('gone')).toBe(false);
    // 削除エッジも一緒に消える（端点が無いため描けない）
    expect(g.hasEdge('touch', 'gone')).toBe(false);
  });

  it('marks changed nodes with an outline so the distinction survives without colour', () => {
    const { g } = buildSigmaGraph(props());

    expect(g.getNodeAttribute('touch', 'highlighted')).toBe(true);
    expect(g.getNodeAttribute('keep', 'highlighted')).toBeUndefined();
  });

  it('prefixes labels so the classification is readable without colour', () => {
    const { g } = buildSigmaGraph(props());

    expect(g.getNodeAttribute('fresh', 'label')).toBe('+ fresh');
    expect(g.getNodeAttribute('gone', 'label')).toBe('- gone');
    expect(g.getNodeAttribute('touch', 'label')).toBe('~ touch');
    expect(g.getNodeAttribute('keep', 'label')).toBe('keep');
  });

  it('colours added and removed edges', () => {
    const { g } = buildSigmaGraph(props());

    expect(g.getEdgeAttribute('touch', 'fresh', 'color')).toBe(diffNodeColor('added', true));
    expect(g.getEdgeAttribute('touch', 'gone', 'color')).toBe(diffNodeColor('removed', true));
  });

  it('keeps the diff colours as the highlight restore colour', () => {
    const { g } = buildSigmaGraph(props());

    // baseColor を控えないと検索ハイライト解除でノード属性から色が再計算され、差分が消える。
    expect(g.getNodeAttribute('fresh', 'baseColor')).toBe(diffNodeColor('added', true));
  });

  it('falls back to community colours when no diff is supplied', () => {
    const { g } = buildSigmaGraph(props({ diff: null }));

    expect(g.getNodeAttribute('keep', 'color')).toBe(communityColor(0));
    expect(g.hasNode('gone')).toBe(false);
  });

  it('does not apply the diff when another colour mode is selected', () => {
    const { g } = buildSigmaGraph(props({ colorBy: 'community' }));

    expect(g.getNodeAttribute('keep', 'color')).toBe(communityColor(0));
    expect(g.hasNode('gone')).toBe(false);
  });

  it('uses light-theme colours when isDark is false', () => {
    const { g } = buildSigmaGraph(props({ isDark: false }));

    expect(g.getNodeAttribute('fresh', 'color')).toBe(diffNodeColor('added', false));
    expect(diffNodeColor('added', false)).not.toBe(diffNodeColor('added', true));
  });
});

/**
 * `mountCodeGraphCanvas.update()` は再構築の要否をこの判定に委ねている。
 * 判定から漏れた prop は「エラーにならず描画が古いまま」という形で壊れるため、
 * 新しい prop が既定で再構築側に入ることをここで固定する。
 */
describe('needsGraphRebuild', () => {
  it('rebuilds when the diff arrives after the baseline fetch settles', () => {
    // 差分表示を選んだ直後はベースライン未取得で diff は null。後から届いたときに
    // 再構築しないと、差分着色もゴーストも永久に出ない（マージ前レビューで検出した欠陥）。
    const before = props({ diff: null });
    const after = props();

    expect(needsGraphRebuild(before, after)).toBe(true);
  });

  it('rebuilds when the removed-node toggle changes', () => {
    expect(needsGraphRebuild(props({ showRemovedNodes: true }), props({ showRemovedNodes: false })))
      .toBe(true);
  });

  it('does not rebuild for a search-highlight change alone', () => {
    // ハイライトは描画済みノードの色を差し替えるだけで済む（sigma を作り直すと重い）。
    const before = props({ highlightedNodes: new Set(['keep']) });
    const after = props({ highlightedNodes: new Set(['fresh']) });

    expect(needsGraphRebuild(before, after)).toBe(false);
  });

  it('does not rebuild when nothing changed', () => {
    const same = props();

    expect(needsGraphRebuild(same, same)).toBe(false);
  });

  it('rebuilds for every prop other than the highlight set', () => {
    // 列挙方式へ戻した場合にここが落ちる。prop を足したのに判定へ入れ忘れる欠陥を、
    // 個別のテストを書き足さなくても検出できるようにする。
    const base = props();
    const changed: Array<Partial<CodeGraphCanvasViewProps>> = [
      { graph: { ...target, generatedAt: '2026-08-05T00:00:00.000Z' } },
      { isDark: false },
      { colorBy: 'community' },
      { neutralColor: '#123456' },
      { riskMap: new Map() },
      { nodeColorOverrides: new Map() },
      { emphasizedNodes: new Set<string>() },
      { ghostEdges: [] },
      { ghostEdgeGranularity: 'session' },
      { onNodeClick: () => {} },
      { diff: null },
      { showRemovedNodes: false },
    ];

    for (const over of changed) {
      const key = Object.keys(over)[0];
      expect([key, needsGraphRebuild(base, props(over))]).toEqual([key, true]);
    }
  });
});
