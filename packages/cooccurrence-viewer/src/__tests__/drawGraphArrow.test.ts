import { LINK_DIRECTION, type LinkDirection } from '@anytime-markdown/graph-core';
import { drawGraph } from '../render/drawGraph';
import { ARROW_TIP_GAP } from '../render/scales';
import type { CooccurrenceTheme } from '../theme/readTheme';
import type { RenderGraph, RenderLink, RenderNode } from '../types';

interface Point {
  x: number;
  y: number;
}

interface RecordingContext {
  ctx: CanvasRenderingContext2D;
  /** fill() された多角形パスの頂点列（矢頭は 3 点になる）。 */
  filledPolygons: Point[][];
  /** stroke() された線分の端点（共起の線）。 */
  strokedLines: Array<{ from: Point; to: Point }>;
  /** fill() 時点の globalAlpha。線と矢頭で同じ値になっている必要がある（設計書 §3.1）。 */
  fillAlphas: number[];
  strokeAlphas: number[];
}

/**
 * パスの構築を記録する canvas コンテキストのモック。
 *
 * Why not 呼び出し回数だけを数えるか: 矢頭が「描かれた」ことだけを見ると、円周に重なる位置や
 * 反対の端へ描かれていても通ってしまう。頂点座標まで記録する。
 */
function createRecordingContext(): RecordingContext {
  const filledPolygons: Point[][] = [];
  const strokedLines: RecordingContext['strokedLines'] = [];
  const fillAlphas: number[] = [];
  const strokeAlphas: number[] = [];
  let path: Point[] = [];
  let alpha = 1;

  const ctx = {
    save(): void {},
    restore(): void {},
    translate(): void {},
    scale(): void {},
    clearRect(): void {},
    fillRect(): void {},
    beginPath(): void {
      path = [];
    },
    moveTo(x: number, y: number): void {
      path.push({ x, y });
    },
    lineTo(x: number, y: number): void {
      path.push({ x, y });
    },
    closePath(): void {},
    arc(): void {
      // 円は多角形パスとして数えない。矢頭だけを filledPolygons へ残す。
      path = [];
    },
    stroke(): void {
      strokeAlphas.push(alpha);
      if (path.length === 2) strokedLines.push({ from: path[0], to: path[1] });
    },
    fill(): void {
      fillAlphas.push(alpha);
      if (path.length >= 3) filledPolygons.push([...path]);
    },
    rect(): void {},
    roundRect(): void {},
    clip(): void {},
    measureText: (text: string) => ({ width: text.length * 8 }),
    fillText(): void {},
    set fillStyle(_v: string) {},
    set strokeStyle(_v: string) {},
    set lineWidth(_v: number) {},
    set font(_v: string) {},
    set globalAlpha(v: number) {
      alpha = v;
    },
    get globalAlpha(): number {
      return alpha;
    },
    set textAlign(_v: string) {},
    set textBaseline(_v: string) {},
    set lineJoin(_v: string) {},
    set lineCap(_v: string) {},
  } as unknown as CanvasRenderingContext2D;

  return { ctx, filledPolygons, strokedLines, fillAlphas, strokeAlphas };
}

function node(index: number, x: number): RenderNode {
  return {
    index,
    layer: 0,
    label: `n${index}`,
    frequency: 5,
    clusterIndex: undefined,
    x,
    y: 0,
    radius: 10,
    fill: '#fff',
    stroke: '#000',
    strokeWidth: 1,
    labelFontSize: 14,
    cooccurrenceCount: 1,
    isSubject: false,
    hasNote: false,
  };
}

function link(direction: LinkDirection, overrides: Partial<RenderLink> = {}): RenderLink {
  return { index: 0, layer: 0, source: 0, target: 1, strength: 5, width: 3, direction, hasNote: false, ...overrides };
}

function theme(): CooccurrenceTheme {
  return {
    mode: 'dark',
    background: '#000',
    surface: '#111',
    text: '#fff',
    textSecondary: '#ccc',
    divider: '#333',
    accent: '#f0f',
    link: '#888',
    viewportFrame: '#eee',
    viewportFill: 'rgba(255,255,255,0.12)',
    mutedAlpha: 0.2,
  };
}

function draw(graph: RenderGraph, selectedNodeIndex: number | null = null): RecordingContext {
  const recording = createRecordingContext();
  drawGraph({
    ctx: recording.ctx,
    width: 400,
    height: 300,
    graph,
    viewport: { scale: 1, offsetX: 0, offsetY: 0 },
    theme: theme(),
    selectedNodeIndex,
  });
  return recording;
}

const twoNodes = [node(0, 0), node(1, 100)];

describe('矢印の描画', () => {
  it('無向では矢頭を描かない', () => {
    const { filledPolygons } = draw({ nodes: twoNodes, links: [link(LINK_DIRECTION.none)], timeLinks: [], layers: [], clusterLanes: [] });
    expect(filledPolygons).toHaveLength(0);
  });

  it('順方向では target 側の円周の手前に矢頭を 1 つ描く', () => {
    const { filledPolygons } = draw({ nodes: twoNodes, links: [link(LINK_DIRECTION.forward)], timeLinks: [], layers: [], clusterLanes: [] });
    expect(filledPolygons).toHaveLength(1);
    expect(filledPolygons[0]).toHaveLength(3);
    expect(filledPolygons[0][0].x).toBeCloseTo(100 - (10 + ARROW_TIP_GAP));
  });

  it('逆方向では source 側の円周の手前に矢頭を 1 つ描く', () => {
    const { filledPolygons } = draw({ nodes: twoNodes, links: [link(LINK_DIRECTION.backward)], timeLinks: [], layers: [], clusterLanes: [] });
    expect(filledPolygons).toHaveLength(1);
    expect(filledPolygons[0][0].x).toBeCloseTo(10 + ARROW_TIP_GAP);
  });

  it('双方向では両端に矢頭を描く', () => {
    const { filledPolygons } = draw({ nodes: twoNodes, links: [link(LINK_DIRECTION.both)], timeLinks: [], layers: [], clusterLanes: [] });
    expect(filledPolygons).toHaveLength(2);
    const tipXs = filledPolygons.map((polygon) => polygon[0].x).sort((a, b) => a - b);
    expect(tipXs[0]).toBeCloseTo(10 + ARROW_TIP_GAP);
    expect(tipXs[1]).toBeCloseTo(100 - (10 + ARROW_TIP_GAP));
  });

  it('矢頭は線と同じ不透明度で描かれる', () => {
    // 語 0 を選ぶと、語 0 に無関係な共起は淡くなる。線だけが淡くなり矢頭が残ると、隠したはず
    // の共起が目立つ（設計書 §3.1）。
    const graph: RenderGraph = {
      nodes: [...twoNodes, node(2, 200), node(3, 300)],
      links: [link(LINK_DIRECTION.forward, { index: 0, layer: 0, source: 2, target: 3 })],
      timeLinks: [],
      layers: [], clusterLanes: [],
    };
    const { fillAlphas, strokeAlphas } = draw(graph, 0);
    const arrowAlpha = fillAlphas[0];
    expect(arrowAlpha).toBeCloseTo(strokeAlphas[0]);
    expect(arrowAlpha).toBeLessThan(1);
  });

  it('線そのものは向きに関わらず両端の中心を結ぶ', () => {
    const { strokedLines } = draw({ nodes: twoNodes, links: [link(LINK_DIRECTION.forward)], timeLinks: [], layers: [], clusterLanes: [] });
    expect(strokedLines[0]).toEqual({ from: { x: 0, y: 0 }, to: { x: 100, y: 0 } });
  });
});
