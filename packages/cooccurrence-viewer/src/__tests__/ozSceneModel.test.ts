import { LINK_DIRECTION } from '@anytime-markdown/graph-core';
import { buildOzSceneModel, LAYER_Z_PITCH, PILL_MAX } from '../scene3d/sceneModel';
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
  return { nodes: [], links: [], timeLinks: [], layers: [], clusterLanes: [], ...parts };
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

  test('レイヤー間の同一語は 1 本の柱になり、両端がそれぞれのレイヤーの z を持つ', () => {
    const model = buildOzSceneModel(graph, null);
    expect(model.pillars).toHaveLength(1);
    const pillar = model.pillars[0];
    expect(pillar.nodeIndex).toBe(0);
    expect(pillar.x).toBe(10);
    expect(pillar.y).toBe(-20);
    expect(pillar.zFrom).toBe(0);
    expect(pillar.zTo).toBe(LAYER_Z_PITCH);
  });

  test('レイヤー名ラベルがレイヤーの z 平面に置かれる', () => {
    const model = buildOzSceneModel(graph, null);
    expect(model.layerLabels).toHaveLength(2);
    expect(model.layerLabels[0].text).toBe('L0');
    expect(model.layerLabels[1].z - model.layerLabels[0].z).toBe(LAYER_Z_PITCH);
  });
});

describe('buildOzSceneModel: 同一語の柱', () => {
  function timeLink(nodeIndex: number, fromLayer: number, toLayer: number, x1: number, x2: number): RenderTimeLink {
    return { nodeIndex, fromLayer, toLayer, x1, y1: 20, x2, y2: 20 };
  }

  test('連続する 3 スライスは 1 本の柱に畳まれ、語名は柱の中央に 1 つだけ出る', () => {
    const graph = graphOf({
      nodes: [makeNode(0, 0, 10, 20), makeNode(0, 1, 1010, 20), makeNode(0, 2, 2010, 20)],
      layers: [makeLayer(0, 0), makeLayer(1, 1000), makeLayer(2, 2000)],
      timeLinks: [timeLink(0, 0, 1, 10, 1010), timeLink(0, 1, 2, 1010, 2010)],
    });
    const model = buildOzSceneModel(graph, null);
    expect(model.pillars).toHaveLength(1);
    const pillar = model.pillars[0];
    expect(pillar.zFrom).toBe(0);
    expect(pillar.zTo).toBe(LAYER_Z_PITCH * 2);
    expect(pillar.labelZ).toBe(LAYER_Z_PITCH);
    expect(pillar.label).toBe('w0');
    expect(pillar.labeled).toBe(true);
    // 節は色ドットへ縮退し、語名を持つのは柱ラベルだけになる。
    // 件数も見る（節が 1 つも返らなくなる退行でも every は通るため）。
    expect(model.nodes).toHaveLength(3);
    expect(model.nodes.every((node) => !node.pill)).toBe(true);
  });

  test('途中のスライスに不在なら柱は 2 本に割れ、欠損区間をまたがない', () => {
    const graph = graphOf({
      nodes: [
        makeNode(0, 0, 10, 20),
        makeNode(0, 1, 1010, 20),
        makeNode(0, 3, 3010, 20),
        makeNode(0, 4, 4010, 20),
      ],
      layers: [makeLayer(0, 0), makeLayer(1, 1000), makeLayer(2, 2000), makeLayer(3, 3000), makeLayer(4, 4000)],
      timeLinks: [timeLink(0, 0, 1, 10, 1010), timeLink(0, 3, 4, 3010, 4010)],
    });
    const model = buildOzSceneModel(graph, null);
    expect(model.pillars.map((pillar) => [pillar.zFrom, pillar.zTo])).toEqual([
      [0, LAYER_Z_PITCH],
      [LAYER_Z_PITCH * 3, LAYER_Z_PITCH * 4],
    ]);
    // 割れた柱はそれぞれ語名を持つ（どちらの区間の語かが読める）。
    expect(model.pillars.every((pillar) => pillar.labeled)).toBe(true);
  });

  test('「同じ語を点線で結ぶ」が OFF なら柱はゼロで、節は従来どおりピルに戻る', () => {
    const graph = graphOf({
      nodes: [makeNode(0, 0, 10, 20), makeNode(0, 1, 1010, 20)],
      layers: [makeLayer(0, 0), makeLayer(1, 1000)],
      timeLinks: [],
    });
    const model = buildOzSceneModel(graph, null);
    expect(model.pillars).toHaveLength(0);
    expect(model.nodes).toHaveLength(2);
    expect(model.nodes.every((node) => node.pill)).toBe(true);
  });

  test('柱を持つ語は、選択してもその節がピルへ昇格しない', () => {
    // ラベル上限を超える構成にして、選択近傍の昇格経路を通す。
    const singles = Array.from({ length: PILL_MAX }, (_, i) =>
      makeNode(i + 1, 0, (i + 1) * 10, 400, { frequency: i + 1 }),
    );
    const graph = graphOf({
      nodes: [makeNode(0, 0, 10, 20), makeNode(0, 1, 1010, 20), ...singles],
      layers: [makeLayer(0, 0), makeLayer(1, 1000)],
      timeLinks: [timeLink(0, 0, 1, 10, 1010)],
      links: [makeLink(0, 0, 0, 1)],
    });
    const model = buildOzSceneModel(graph, 0);
    const covered = model.nodes.filter((node) => node.index === 0);
    expect(covered).toHaveLength(2);
    // 語名は柱ラベルが 1 つ持つ。選択しても節へラベルが戻らない（同じ語名が 3 回読める状態に戻らない）。
    expect(covered.every((node) => !node.pill)).toBe(true);
    expect(model.pillars[0].labeled).toBe(true);
  });

  test('選択の近傍外では柱と柱ラベルが淡くなる', () => {
    const graph = graphOf({
      nodes: [makeNode(0, 0, 10, 20), makeNode(0, 1, 1010, 20), makeNode(1, 0, 500, 20)],
      layers: [makeLayer(0, 0), makeLayer(1, 1000)],
      timeLinks: [timeLink(0, 0, 1, 10, 1010)],
    });
    const plain = buildOzSceneModel(graph, null);
    expect(plain.pillars[0].alpha).toBeCloseTo(0.7, 6);
    expect(plain.pillars[0].labelAlpha).toBe(1);

    // 語 1 を選ぶと、繋がっていない語 0 の柱は 2D と同じ 0.18 まで落ちる。
    const selected = buildOzSceneModel(graph, 1);
    expect(selected.pillars[0].alpha).toBeCloseTo(0.7 * 0.18, 6);
    expect(selected.pillars[0].labelAlpha).toBe(0.18);
  });

  test('ラベルの上限 PILL_MAX は柱ラベルと節のピルで共有する', () => {
    const singles = Array.from({ length: PILL_MAX }, (_, i) =>
      makeNode(i + 1, 0, (i + 1) * 10, 400, { frequency: i + 1 }),
    );
    const graph = graphOf({
      nodes: [
        makeNode(0, 0, 10, 20, { frequency: 10_000 }),
        makeNode(0, 1, 1010, 20, { frequency: 10_000 }),
        ...singles,
      ],
      layers: [makeLayer(0, 0), makeLayer(1, 1000)],
      timeLinks: [timeLink(0, 0, 1, 10, 1010)],
    });
    const model = buildOzSceneModel(graph, null);
    // ラベル対象は「柱 1 本 + 単独語 PILL_MAX 個」で上限を 1 つ超える。最低頻度の語が漏れる。
    expect(model.pillars[0].labeled).toBe(true);
    expect(model.nodes.filter((node) => node.pill)).toHaveLength(PILL_MAX - 1);
    expect(model.nodes.find((node) => node.index === 1)?.pill).toBe(false);
  });
});

describe('buildOzSceneModel: 選択と近傍ハイライト', () => {
  const graph = graphOf({
    nodes: [makeNode(0, 0, 0, 0), makeNode(1, 0, 100, 0), makeNode(2, 0, 200, 0)],
    links: [makeLink(0, 0, 0, 1), makeLink(1, 0, 1, 2)],
  });

  test('選択なしは全て alpha 1', () => {
    const model = buildOzSceneModel(graph, null);
    expect(model.nodes.every((node) => node.alpha === 1)).toBe(true);
    expect(model.links.every((link) => link.alpha === 1)).toBe(true);
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

  test('レイヤー表示では近傍の節を、選択語との線があるレイヤーでだけ明るく残す', () => {
    // 語 0（選択）と語 1 は層 0〜1 の両方に存在するが、共起の線は層 0 にしか無い。
    const graph = graphOf({
      nodes: [
        makeNode(0, 0, 10, 20), makeNode(0, 1, 1010, 20),
        makeNode(1, 0, 100, 20), makeNode(1, 1, 1100, 20),
      ],
      layers: [makeLayer(0, 0), makeLayer(1, 1000)],
      links: [makeLink(0, 0, 0, 1)],
    });
    const model = buildOzSceneModel(graph, 0);
    const at = (index: number, layer: number) => model.nodes.find((n) => n.index === index && n.layer === layer);
    // 選択語自身は全レイヤーで明るいまま。
    expect(at(0, 0)?.alpha).toBe(1);
    expect(at(0, 1)?.alpha).toBe(1);
    // 近傍は線のある層 0 だけ。層 1 は淡くなる。
    expect(at(1, 0)?.alpha).toBe(1);
    expect(at(1, 1)?.alpha).toBe(0.18);
  });

  test('柱は覆う区間のどこかのレイヤーが点灯していれば柱全体が明るいまま', () => {
    // 語 1 は層 0〜1 を柱で貫き、選択語 0 との線は層 0 だけにある。
    const graph = graphOf({
      nodes: [
        makeNode(0, 0, 10, 20),
        makeNode(1, 0, 100, 20), makeNode(1, 1, 1100, 20),
      ],
      layers: [makeLayer(0, 0), makeLayer(1, 1000)],
      timeLinks: [{ nodeIndex: 1, fromLayer: 0, toLayer: 1, x1: 100, y1: 20, x2: 1100, y2: 20 }],
      links: [makeLink(0, 0, 0, 1)],
    });
    const model = buildOzSceneModel(graph, 0);
    expect(model.pillars[0].alpha).toBeCloseTo(0.7, 6);
    expect(model.pillars[0].labelAlpha).toBe(1);
  });
});

describe('buildOzSceneModel: ピル選抜（v2）', () => {
  test('PILL_MAX 以内なら全ノードがピルで、語テキストを持つ', () => {
    const graph = graphOf({ nodes: [makeNode(0, 0, 0, 0), makeNode(1, 0, 100, 0)] });
    const model = buildOzSceneModel(graph, null);
    expect(model.nodes.every((node) => node.pill)).toBe(true);
    expect(model.nodes[0].label).toBe('w0');
  });

  test('超過時は頻度上位 PILL_MAX 語だけがピルになる', () => {
    const nodes = Array.from({ length: PILL_MAX + 1 }, (_, i) =>
      makeNode(i, 0, i * 10, 0, { frequency: i + 1 }),
    );
    const model = buildOzSceneModel(graphOf({ nodes }), null);
    const byIndex = new Map(model.nodes.map((node) => [node.index, node]));
    // 最低頻度の語 0 だけが漏れて色ドットになる。
    expect(byIndex.get(0)?.pill).toBe(false);
    expect(model.nodes.filter((node) => node.pill)).toHaveLength(PILL_MAX);
  });

  test('選択中はその近傍が頻度に関係なくピルへ昇格する', () => {
    const nodes = Array.from({ length: PILL_MAX + 2 }, (_, i) =>
      makeNode(i, 0, i * 10, 0, { frequency: i === 0 || i === 1 ? 0 : i + 10 }),
    );
    const graph = graphOf({ nodes, links: [makeLink(0, 0, 0, 1)] });
    const model = buildOzSceneModel(graph, 0);
    const byIndex = new Map(model.nodes.map((node) => [node.index, node]));
    expect(byIndex.get(0)?.pill).toBe(true);
    expect(byIndex.get(1)?.pill).toBe(true);
  });
});

describe('buildOzSceneModel: 曲線ストリーム（v2）', () => {
  test('制御点は決定的で、中点から線分と直交する向きへ離れる', () => {
    const graph = graphOf({
      nodes: [makeNode(0, 0, 0, 0), makeNode(1, 0, 100, 0)],
      links: [makeLink(0, 0, 0, 1)],
    });
    const a = buildOzSceneModel(graph, null);
    const b = buildOzSceneModel(graph, null);
    const link = a.links[0];
    expect([link.cpX, link.cpY, link.cpZ]).toEqual([b.links[0].cpX, b.links[0].cpY, b.links[0].cpZ]);
    const midX = (link.x1 + link.x2) / 2;
    const midY = (link.y1 + link.y2) / 2;
    const midZ = (link.z1 + link.z2) / 2;
    const offX = link.cpX - midX;
    const offY = link.cpY - midY;
    const offZ = link.cpZ - midZ;
    expect(Math.hypot(offX, offY, offZ)).toBeGreaterThan(0);
    const dot = offX * (link.x2 - link.x1) + offY * (link.y2 - link.y1) + offZ * (link.z2 - link.z1);
    expect(dot).toBeCloseTo(0, 6);
  });

  test('流す向きは向き付きが source→target（backward は逆・both は流さない）', () => {
    const graph = graphOf({
      nodes: [makeNode(0, 0, 0, 0), makeNode(1, 0, 100, 0)],
      links: [
        makeLink(0, 0, 0, 1, { direction: LINK_DIRECTION.none }),
        makeLink(1, 0, 0, 1, { direction: LINK_DIRECTION.forward }),
        makeLink(2, 0, 0, 1, { direction: LINK_DIRECTION.backward }),
        makeLink(3, 0, 0, 1, { direction: LINK_DIRECTION.both }),
      ],
    });
    const model = buildOzSceneModel(graph, null);
    expect(model.links.map((link) => link.flow)).toEqual([1, 1, -1, 0]);
  });
});

describe('buildOzSceneModel: クラスタ見出し（v2）', () => {
  test('label 持ちクラスタは重心 x・クラスタ上端より上にクラスタ色で出る', () => {
    const graph = graphOf({
      nodes: [
        makeNode(0, 0, 0, 0, { clusterIndex: 0, stroke: '#FF6B6B' }),
        makeNode(1, 0, 100, -80, { clusterIndex: 0, stroke: '#FF6B6B' }),
        makeNode(2, 0, 500, 0, { clusterIndex: 1, stroke: '#4FC3F7' }),
      ],
    });
    const model = buildOzSceneModel(graph, null, ['TOOLS', '']);
    expect(model.headings).toHaveLength(1);
    const heading = model.headings[0];
    expect(heading.text).toBe('TOOLS');
    expect(heading.color).toBe('#FF6B6B');
    expect(heading.x).toBeCloseTo(50, 6);
    // ピルの山に埋もれないよう、所属ノードの最上端（シーン y の最大）より上に置く。
    const memberTop = Math.max(model.nodes[0].y, model.nodes[1].y);
    expect(heading.y).toBeGreaterThan(memberTop);
  });

  test('所属ノードのないクラスタ・引数省略時は出さない', () => {
    const graph = graphOf({ nodes: [makeNode(0, 0, 0, 0, { clusterIndex: 0 })] });
    expect(buildOzSceneModel(graph, null, ['TOOLS', 'OUTPUT']).headings).toHaveLength(1);
    expect(buildOzSceneModel(graph, null).headings).toHaveLength(0);
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
