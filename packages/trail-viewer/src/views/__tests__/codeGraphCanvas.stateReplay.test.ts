import type { CodeGraph, CodeGraphNode } from '@anytime-markdown/trail-core/codeGraph';
import { diffCodeGraphs } from '@anytime-markdown/trail-core/codeGraphDiff';
import { buildSigmaGraph, type CodeGraphCanvasViewProps } from '../codeGraphSigmaGraph';
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

function props(over: Partial<CodeGraphCanvasViewProps> = {}): CodeGraphCanvasViewProps {
  return {
    graph: target,
    colorBy: 'diff',
    isDark: true,
    diff: diffCodeGraphs(baseline, target),
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
