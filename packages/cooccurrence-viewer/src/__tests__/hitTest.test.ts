import type { RenderGraph, RenderLink, RenderNode } from '../types';
import { hitTestLink, hitTestNode } from '../viewport/hitTest';

function node(index: number, x: number): RenderNode {
  return {
    index,
    label: `node-${index}`,
    frequency: 1,
    clusterIndex: undefined,
    x,
    y: 0,
    radius: 10,
    fill: '#fff',
    stroke: '#000',
    strokeWidth: 2,
    labelFontSize: 12,
    cooccurrenceCount: 0,
    isSubject: false,
    hasNote: false,
  };
}

describe('hitTestNode', () => {
  it('finds a node from screen coordinates through the viewport', () => {
    const graph: RenderGraph = { nodes: [node(0, 10)], links: [] };
    expect(hitTestNode(graph, 30, 0, { scale: 2, offsetX: 10, offsetY: 0 })?.index).toBe(0);
  });

  it('returns null outside every circle', () => {
    const graph: RenderGraph = { nodes: [node(0, 10)], links: [] };
    expect(hitTestNode(graph, 100, 0, { scale: 1, offsetX: 0, offsetY: 0 })).toBeNull();
  });
});

function link(overrides: Partial<RenderLink> = {}): RenderLink {
  return { index: 0, source: 0, target: 1, strength: 1, width: 2, direction: 0, hasNote: false, ...overrides };
}

const IDENTITY = { scale: 1, offsetX: 0, offsetY: 0 };

describe('hitTestLink', () => {
  const graph: RenderGraph = { nodes: [node(0, 0), node(1, 200)], links: [link()] };

  it('線の上を拾う', () => {
    expect(hitTestLink(graph, 100, 0, IDENTITY)?.index).toBe(0);
  });

  it('許容幅の内側は拾い、外側は拾わない', () => {
    expect(hitTestLink(graph, 100, 5, IDENTITY)).not.toBeNull();
    expect(hitTestLink(graph, 100, 20, IDENTITY)).toBeNull();
  });

  it('線分の外側（端点の先）は拾わない', () => {
    expect(hitTestLink(graph, 400, 0, IDENTITY)).toBeNull();
  });

  // 細い共起ほど当たり判定も細くなると、弱い共起のメモだけが実質読めなくなる。
  it('線が細くても許容幅は変わらない', () => {
    const thin: RenderGraph = { ...graph, links: [link({ width: 0.5 })] };
    expect(hitTestLink(thin, 100, 5, IDENTITY)).not.toBeNull();
  });

  it('拡大すると許容幅は世界座標では狭くなる（画面上は一定）', () => {
    const zoomed = { scale: 4, offsetX: 0, offsetY: 0 };
    // 画面 y=5 は世界 y=1.25。等倍では拾えた世界 y=5 相当（画面 y=20）は外れる。
    expect(hitTestLink(graph, 100, 5, zoomed)).not.toBeNull();
    expect(hitTestLink(graph, 100, 40, zoomed)).toBeNull();
  });

  it('重なった線では近いほうを拾う', () => {
    const overlapping: RenderGraph = {
      nodes: [node(0, 0), node(1, 200), { ...node(2, 0), y: 8 }, { ...node(3, 200), y: 8 }],
      links: [link({ index: 0 }), link({ index: 1, source: 2, target: 3 })],
    };
    expect(hitTestLink(overlapping, 100, 7, IDENTITY)?.index).toBe(1);
    expect(hitTestLink(overlapping, 100, 1, IDENTITY)?.index).toBe(0);
  });
});
