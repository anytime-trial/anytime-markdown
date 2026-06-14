import { buildThinkingDiagram } from '../../presets/index';
import type { ThinkingDiagramSpec } from '../../presets/index';

/** ダイアグラムを構築し、ノードに付与された metadata.path の集合を返す。 */
function pathsOf(spec: ThinkingDiagramSpec): Set<string> {
  const doc = buildThinkingDiagram(spec, true);
  const paths = new Set<string>();
  for (const n of doc.nodes) {
    const p = n.metadata?.path;
    if (typeof p === 'string') paths.add(p);
  }
  return paths;
}

describe('presets: node.metadata.path', () => {
  it('fishbone: problem と categories.i', () => {
    const paths = pathsOf({
      type: 'fishbone',
      problem: 'P',
      categories: [
        { label: '人', causes: ['a'] },
        { label: '機械', causes: [] },
      ],
    });
    expect(paths).toContain('problem');
    expect(paths).toContain('categories.0');
    expect(paths).toContain('categories.1');
  });

  it('causal-loop: variables.i', () => {
    const paths = pathsOf({
      type: 'causal-loop',
      links: [
        { from: 'A', to: 'B', polarity: '+' },
        { from: 'B', to: 'C', polarity: '-' },
      ],
    });
    // 変数は A, B, C の 3 個（出現順）
    expect(paths).toContain('variables.0');
    expect(paths).toContain('variables.1');
    expect(paths).toContain('variables.2');
  });

  it('pyramid: tiers.i', () => {
    const paths = pathsOf({ type: 'pyramid', tiers: [{ label: 'x' }, { label: 'y', desc: 'd' }] });
    expect(paths).toContain('tiers.0');
    expect(paths).toContain('tiers.1');
  });

  it('mindmap: root / branches.i / branches.i.children.j', () => {
    const paths = pathsOf({
      type: 'mindmap',
      root: 'R',
      branches: [{ label: 'b0', children: [{ label: 'c0' }, { label: 'c1' }] }, { label: 'b1' }],
    });
    expect(paths).toContain('root');
    expect(paths).toContain('branches.0');
    expect(paths).toContain('branches.1');
    expect(paths).toContain('branches.0.children.0');
    expect(paths).toContain('branches.0.children.1');
  });

  it('logic-tree: root / children.i / children.i.children.j', () => {
    const paths = pathsOf({
      type: 'logic-tree',
      root: 'R',
      children: [{ label: 'c0', children: [{ label: 'g0' }] }, { label: 'c1' }],
    });
    expect(paths).toContain('root');
    expect(paths).toContain('children.0');
    expect(paths).toContain('children.1');
    expect(paths).toContain('children.0.children.0');
  });

  it('why-chain: problem / steps.i', () => {
    const paths = pathsOf({ type: 'why-chain', problem: 'P', steps: ['s0', 's1'] });
    expect(paths).toContain('problem');
    expect(paths).toContain('steps.0');
    expect(paths).toContain('steps.1');
  });

  it('double-diamond: phase キー', () => {
    const paths = pathsOf({
      type: 'double-diamond',
      discover: ['a'],
      define: [],
      develop: [],
      deliver: ['b'],
    });
    expect(paths).toContain('discover');
    expect(paths).toContain('define');
    expect(paths).toContain('develop');
    expect(paths).toContain('deliver');
  });

  it('swot: 象限キー', () => {
    const paths = pathsOf({
      type: 'swot',
      strengths: ['a'],
      weaknesses: [],
      opportunities: [],
      threats: ['b'],
    });
    expect(paths).toContain('strengths');
    expect(paths).toContain('weaknesses');
    expect(paths).toContain('opportunities');
    expect(paths).toContain('threats');
  });

  it('morph-box: parameters.r と parameters.r.options.c', () => {
    const paths = pathsOf({
      type: 'morph-box',
      parameters: [{ label: 'p0', options: ['o0', 'o1'] }, { label: 'p1', options: [] }],
    });
    expect(paths).toContain('parameters.0');
    expect(paths).toContain('parameters.1');
    expect(paths).toContain('parameters.0.options.0');
    expect(paths).toContain('parameters.0.options.1');
  });

  it('affinity: groups.i と groups.i.notes.n', () => {
    const paths = pathsOf({
      type: 'affinity',
      groups: [{ label: 'g0', notes: ['n0', 'n1'] }, { label: 'g1', notes: [] }],
    });
    expect(paths).toContain('groups.0');
    expect(paths).toContain('groups.1');
    expect(paths).toContain('groups.0.notes.0');
    expect(paths).toContain('groups.0.notes.1');
  });
});
