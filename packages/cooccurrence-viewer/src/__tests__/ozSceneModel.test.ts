import { LINK_DIRECTION } from '@anytime-markdown/graph-core';
import { buildOzSceneModel, LABEL_MAX, LAYER_Z_PITCH } from '../scene3d/sceneModel';
import type { RenderGraph, RenderLayer, RenderLink, RenderNode, RenderTimeLink } from '../types';

function makeNode(index: number, layer: number, x: number, y: number, over: Partial<RenderNode> = {}): RenderNode {
  return {
    index,
    layer,
    label: `w${index}`,
    frequency: 1,
    clusterIndex: 0,
    x,
    y,
    radius: 10,
    fill: 'rgba(255,107,107,0.18)',
    stroke: '#FF6B6B',
    strokeWidth: 1,
    labelFontSize: 12,
    cooccurrenceCount: 0,
    isSubject: false,
    hasNote: false,
    ...over,
  };
}

function makeLink(index: number, layer: number, source: number, target: number, over: Partial<RenderLink> = {}): RenderLink {
  return {
    index,
    layer,
    source,
    target,
    strength: 1,
    width: 2,
    direction: LINK_DIRECTION.none,
    hasNote: false,
    ...over,
  };
}

function makeLayer(layer: number, offsetX: number, over: Partial<RenderLayer> = {}): RenderLayer {
  return { layer, slice: layer, label: `L${layer}`, offsetX, offsetY: 0, labelX: offsetX, labelY: -100, ...over };
}

function graphOf(parts: Partial<RenderGraph>): RenderGraph {
  return { nodes: [], links: [], timeLinks: [], layers: [], ...parts };
}

describe('buildOzSceneModel: 単一表示', () => {
  test('z は決定的で、クラスタが違えば帯が変わり、y は符号反転する', () => {
    const graph = graphOf({
      nodes: [makeNode(0, 0, 10, 50, { clusterIndex: 0 }), makeNode(1, 0, 20, -30, { clusterIndex: 1 })],
    });
    const a = buildOzSceneModel(graph, null);
    const b = buildOzSceneModel(graph, null);
    expect(a.nodes[0].z).toBe(b.nodes[0].z);
    expect(a.nodes[1].z).toBe(b.nodes[1].z);
    expect(Math.abs(a.nodes[0].z - a.nodes[1].z)).toBeGreaterThanOrEqual(30);
    expect(a.nodes[0].y).toBe(-50);
    expect(a.nodes[1].y).toBe(30);
    expect(a.nodes[0].color).toBe('#FF6B6B');
  });
});

describe('buildOzSceneModel: レイヤー表示', () => {
  const layers = [makeLayer(0, 0), makeLayer(1, 1000)];
  const timeLinks: RenderTimeLink[] = [
    { nodeIndex: 0, fromLayer: 0, toLayer: 1, x1: 10, y1: 20, x2: 1010, y2: 20 },
  ];
  const graph = graphOf({
    nodes: [makeNode(0, 0, 10, 20), makeNode(0, 1, 1010, 20)],
    layers,
    timeLinks,
  });

  test('2D の横並びオフセットを外し、レイヤーは z 方向へ等間隔に並ぶ', () => {
    const model = buildOzSceneModel(graph, null);
    expect(model.nodes[0].x).toBe(10);
    expect(model.nodes[1].x).toBe(10);
    expect(model.nodes[0].y).toBe(-20);
    expect(model.nodes[1].y).toBe(-20);
    expect(model.nodes[1].z - model.nodes[0].z).toBe(LAYER_Z_PITCH);
  });

  test('レイヤー間の点線は両端がそれぞれのレイヤーの z を持つ', () => {
    const model = buildOzSceneModel(graph, null);
    expect(model.timeLinks).toHaveLength(1);
    const tl = model.timeLinks[0];
    expect(tl.x1).toBe(10);
    expect(tl.x2).toBe(10);
    expect(tl.z2 - tl.z1).toBe(LAYER_Z_PITCH);
  });

  test('レイヤー名ラベルがレイヤーの z 平面に置かれる', () => {
    const model = buildOzSceneModel(graph, null);
    expect(model.layerLabels).toHaveLength(2);
    expect(model.layerLabels[0].text).toBe('L0');
    expect(model.layerLabels[1].z - model.layerLabels[0].z).toBe(LAYER_Z_PITCH);
  });
});

describe('buildOzSceneModel: 選択と近傍ハイライト', () => {
  const graph = graphOf({
    nodes: [makeNode(0, 0, 0, 0), makeNode(1, 0, 100, 0), makeNode(2, 0, 200, 0)],
    links: [makeLink(0, 0, 0, 1), makeLink(1, 0, 1, 2)],
  });

  test('選択なしは全て alpha 1 でラベルは空', () => {
    const model = buildOzSceneModel(graph, null);
    expect(model.nodes.every((node) => node.alpha === 1)).toBe(true);
    expect(model.links.every((link) => link.alpha === 1)).toBe(true);
    expect(model.labels).toHaveLength(0);
  });

  test('選択時は 2D と同じ規則で近傍外を淡くする（ノード 0.18・線 0.14）', () => {
    const model = buildOzSceneModel(graph, 0);
    const byIndex = new Map(model.nodes.map((node) => [node.index, node]));
    expect(byIndex.get(0)?.alpha).toBe(1);
    expect(byIndex.get(1)?.alpha).toBe(1);
    expect(byIndex.get(2)?.alpha).toBe(0.18);
    expect(model.links[0].alpha).toBe(1);
    expect(model.links[1].alpha).toBe(0.14);
  });

  test('ラベルは選択語と近傍語だけに出る', () => {
    const model = buildOzSceneModel(graph, 0);
    const texts = model.labels.map((label) => label.text).sort();
    expect(texts).toEqual(['w0', 'w1']);
    expect(model.labels.length).toBeLessThanOrEqual(LABEL_MAX);
  });
});

describe('buildOzSceneModel: 向き（円錐）', () => {
  test('forward は target 側の球面手前に正規化された向きで置かれる', () => {
    const graph = graphOf({
      nodes: [makeNode(0, 0, 0, 0), makeNode(1, 0, 100, 0)],
      links: [makeLink(0, 0, 0, 1, { direction: LINK_DIRECTION.forward })],
    });
    const model = buildOzSceneModel(graph, null);
    expect(model.cones).toHaveLength(1);
    const cone = model.cones[0];
    const norm = Math.hypot(cone.dirX, cone.dirY, cone.dirZ);
    expect(norm).toBeCloseTo(1, 6);
    // 向きはシーン座標での source → target と一致する（z はジッタを含むため 2D 軸とは一致しない）。
    const [source, target] = model.nodes;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const dz = target.z - source.z;
    const length = Math.hypot(dx, dy, dz);
    expect(cone.dirX).toBeCloseTo(dx / length, 6);
    expect(cone.dirY).toBeCloseTo(dy / length, 6);
    expect(cone.dirZ).toBeCloseTo(dz / length, 6);
    // 置き場所は target の球面より手前（target から半径 + size ぶん戻った点）。
    const back = Math.hypot(target.x - cone.x, target.y - cone.y, target.z - cone.z);
    expect(back).toBeCloseTo(target.radius + cone.size, 6);
  });

  test('both は両端に 1 つずつ置かれる', () => {
    const graph = graphOf({
      nodes: [makeNode(0, 0, 0, 0), makeNode(1, 0, 100, 0)],
      links: [makeLink(0, 0, 0, 1, { direction: LINK_DIRECTION.both })],
    });
    const model = buildOzSceneModel(graph, null);
    expect(model.cones).toHaveLength(2);
  });
});
