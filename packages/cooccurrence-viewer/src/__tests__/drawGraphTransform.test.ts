import { drawGraph } from '../render/drawGraph';
import type { CooccurrenceTheme } from '../theme/readTheme';
import type { RenderGraph, RenderNode, ViewportState } from '../types';

/** 変換行列 [a, b, c, d, e, f]。点は (a*x + c*y + e, b*x + d*y + f) へ移る。 */
type Matrix = [number, number, number, number, number, number];

interface DevicePoint {
  x: number;
  y: number;
}

interface RecordingContext {
  ctx: CanvasRenderingContext2D;
  /** arc() の中心をデバイス座標で記録したもの（＝実際に円が描かれた位置）。 */
  arcs: Array<DevicePoint & { radius: number }>;
  /** fillText() の基準点をデバイス座標で記録したもの（＝実際に文字が描かれた位置）。 */
  texts: Array<DevicePoint & { text: string }>;
  /** clearRect() の矩形をデバイス座標で記録したもの（＝実際に消えた範囲）。 */
  clears: Array<{ left: number; top: number; right: number; bottom: number }>;
}

function apply(m: Matrix, x: number, y: number): DevicePoint {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/**
 * CTM（現在の変換行列）を追跡する canvas コンテキストのモック。
 *
 * Why not 素の no-op モック: 変換系メソッドを握り潰すと、円とラベルが別の座標系で
 * 描かれていても検査が通ってしまう（実際にこの取りこぼしで DPR ずれが出荷された）。
 */
function createRecordingContext(base: Matrix): RecordingContext {
  let matrix: Matrix = [...base];
  const stack: Matrix[] = [];
  const arcs: Array<DevicePoint & { radius: number }> = [];
  const texts: Array<DevicePoint & { text: string }> = [];
  const clears: RecordingContext['clears'] = [];

  const ctx = {
    save(): void {
      stack.push([...matrix]);
    },
    restore(): void {
      const previous = stack.pop();
      if (previous) matrix = previous;
    },
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
      matrix = [a, b, c, d, e, f];
    },
    translate(tx: number, ty: number): void {
      const [a, b, c, d, e, f] = matrix;
      matrix = [a, b, c, d, e + a * tx + c * ty, f + b * tx + d * ty];
    },
    scale(sx: number, sy: number): void {
      const [a, b, c, d, e, f] = matrix;
      matrix = [a * sx, b * sx, c * sy, d * sy, e, f];
    },
    arc(x: number, y: number, radius: number): void {
      arcs.push({ ...apply(matrix, x, y), radius });
    },
    fillText(text: string, x: number, y: number): void {
      texts.push({ text, ...apply(matrix, x, y) });
    },
    clearRect(x: number, y: number, w: number, h: number): void {
      const topLeft = apply(matrix, x, y);
      const bottomRight = apply(matrix, x + w, y + h);
      clears.push({ left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y });
    },
    fillRect(): void {},
    beginPath(): void {},
    closePath(): void {},
    moveTo(): void {},
    lineTo(): void {},
    stroke(): void {},
    fill(): void {},
    rect(): void {},
    roundRect(): void {},
    clip(): void {},
    measureText: (text: string) => ({ width: text.length * 8 }),
    set fillStyle(_v: string) {},
    set strokeStyle(_v: string) {},
    set lineWidth(_v: number) {},
    set font(_v: string) {},
    set globalAlpha(_v: number) {},
    set textAlign(_v: string) {},
    set textBaseline(_v: string) {},
    set lineJoin(_v: string) {},
    set lineCap(_v: string) {},
  } as unknown as CanvasRenderingContext2D;

  return { ctx, arcs, texts, clears };
}

function node(overrides: Partial<RenderNode> = {}): RenderNode {
  return {
    index: 0,
    layer: 0,
    label: 'A',
    frequency: 5,
    clusterIndex: undefined,
    x: 100,
    y: 50,
    radius: 12,
    fill: '#fff',
    stroke: '#000',
    strokeWidth: 1,
    labelFontSize: 14,
    cooccurrenceCount: 1,
    isSubject: false,
    hasNote: false,
    ...overrides,
  };
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
    mutedAlpha: 0.2,
  };
}

function drawAt(dpr: number, viewport: ViewportState, graph: RenderGraph): RecordingContext {
  const recording = createRecordingContext([dpr, 0, 0, dpr, 0, 0]);
  drawGraph({
    ctx: recording.ctx,
    width: 400,
    height: 300,
    graph,
    viewport,
    theme: theme(),
    selectedNodeIndex: null,
  });
  return recording;
}

/**
 * クラスタレーン名（要件書「クラスタレーン表示」§2.4）。
 *
 * レーン名は語ラベルと違い、縮小しても読める大きさで画面ピクセルへ描く。描画そのものを検査
 * しないと、名前が一切出ていなくても図は「レーンに分かれた図」として成立してしまう。
 */
describe('クラスタレーン名', () => {
  function graphWithLanes(axis: 'horizontal' | 'vertical'): RenderGraph {
    return {
      nodes: [node()],
      links: [],
      timeLinks: [],
      layers: [],
      clusterLanes: [
        { cluster: 0, axis, label: '赤', color: '#f00', labelX: 0, labelY: 0, subLanes: [] },
        { axis, label: '未分類', color: '#888', labelX: 0, labelY: 200, subLanes: [] },
      ],
    };
  }

  it('レーンの本数だけ名前を描く', () => {
    const { texts } = drawAt(1, { scale: 1, offsetX: 0, offsetY: 0 }, graphWithLanes('vertical'));
    expect(texts.map((entry) => entry.text)).toEqual(expect.arrayContaining(['赤', '未分類']));
  });

  it('縦レーンでは名前が図の左外へ出る', () => {
    const { texts, arcs } = drawAt(1, { scale: 1, offsetX: 0, offsetY: 0 }, graphWithLanes('vertical'));
    const lane = texts.find((entry) => entry.text === '赤');
    expect(lane).toBeDefined();
    // 語（x=100）より左。レーン名がレーンの内側へ入ると円やラベルと重なる。
    expect(lane!.x).toBeLessThan(arcs[0].x);
  });

  it('横レーンでは名前が図の上外へ出る', () => {
    const { texts, arcs } = drawAt(1, { scale: 1, offsetX: 0, offsetY: 0 }, graphWithLanes('horizontal'));
    const lane = texts.find((entry) => entry.text === '赤');
    expect(lane).toBeDefined();
    expect(lane!.y).toBeLessThan(arcs[0].y);
  });

  it('サブレーン名をクラスタ名より内側・小さく描く', () => {
    const graph: RenderGraph = {
      nodes: [node()],
      links: [],
      timeLinks: [],
      layers: [],
      clusterLanes: [
        {
          cluster: 0,
          axis: 'vertical',
          label: '売られた側',
          color: '#f00',
          labelX: 0,
          labelY: 0,
          subLanes: [
            { label: '半導体・AI 関連', labelX: 0, labelY: 0 },
            { labelX: 0, labelY: 80 },
          ],
        },
      ],
    };
    const { texts } = drawAt(1, { scale: 1, offsetX: 0, offsetY: 0 }, graph);
    const cluster = texts.find((entry) => entry.text === '売られた側');
    const sub = texts.find((entry) => entry.text === '半導体・AI 関連');
    expect(cluster).toBeDefined();
    expect(sub).toBeDefined();
    // 縦レーンでは右揃えのため、内側へ字下げすると x が小さくなる。
    expect(sub!.x).toBeLessThan(cluster!.x);
    // 名前を持たない残余サブレーンは描かない。
    expect(texts.filter((entry) => entry.text === '').length).toBe(0);
  });

  it('レーンが無ければ名前は描かない', () => {
    const { texts } = drawAt(1, { scale: 1, offsetX: 0, offsetY: 0 }, {
      nodes: [node()],
      links: [],
      timeLinks: [],
      layers: [],
      clusterLanes: [],
    });
    expect(texts.map((entry) => entry.text)).toEqual(['A']);
  });
});

describe('円とラベルは同じ座標系で描かれる', () => {
  const graph: RenderGraph = { nodes: [node()], links: [], timeLinks: [], layers: [], clusterLanes: [] };

  it.each([
    ['dpr=1', 1, { scale: 1, offsetX: 0, offsetY: 0 }],
    ['dpr=1.5・等倍', 1.5, { scale: 1, offsetX: 0, offsetY: 0 }],
    ['dpr=2・等倍', 2, { scale: 1, offsetX: 0, offsetY: 0 }],
    ['dpr=2・拡大', 2, { scale: 2.5, offsetX: 40, offsetY: 20 }],
    ['dpr=2・縮小', 2, { scale: 0.4, offsetX: 120, offsetY: 90 }],
  ])('%s でラベルが円の中心へ載る', (_name, dpr, viewport) => {
    const { arcs, texts } = drawAt(dpr, viewport as ViewportState, graph);

    expect(arcs).toHaveLength(1);
    expect(texts).toHaveLength(1);
    expect(texts[0].x).toBeCloseTo(arcs[0].x, 5);
    expect(texts[0].y).toBeCloseTo(arcs[0].y, 5);
  });

  it('拡大率を変えても円とラベルのずれは生じない（DPR に依存しない）', () => {
    const gaps = [1, 1.25, 1.5, 2, 3].map((dpr) => {
      const { arcs, texts } = drawAt(dpr, { scale: 1.8, offsetX: 30, offsetY: 10 }, graph);
      return Math.hypot(texts[0].x - arcs[0].x, texts[0].y - arcs[0].y) / dpr;
    });

    for (const gap of gaps) expect(gap).toBeLessThan(0.5);
  });

  it.each([1, 1.5, 2])('dpr=%s でバッキングストア全面を消去する', (dpr) => {
    // 消し残しがあると、その領域に描かれたラベルが前フレームのまま残る（パン時のゴースト）。
    const { clears } = drawAt(dpr, { scale: 1, offsetX: 0, offsetY: 0 }, graph);

    expect(clears).toHaveLength(1);
    expect(clears[0]).toEqual({ left: 0, top: 0, right: 400 * dpr, bottom: 300 * dpr });
  });

  // ホバーの情報は canvas ではなく DOM のポップアップが持つ（設計書 §3.1）。canvas に残るのは
  // 「メモを持つ」という印だけであり、その印は円の右上・円周上に置かれる。
  it('メモを持つ語には円の右上に印を描く', () => {
    const dpr = 2;
    const noted = node({ hasNote: true });
    const { arcs } = drawAt(dpr, { scale: 1, offsetX: 0, offsetY: 0 }, { nodes: [noted], links: [], timeLinks: [], layers: [], clusterLanes: [] });

    expect(arcs).toHaveLength(2);
    const offset = (noted.radius * Math.SQRT1_2) * dpr;
    expect(arcs[1].x - arcs[0].x).toBeCloseTo(offset, 5);
    expect(arcs[1].y - arcs[0].y).toBeCloseTo(-offset, 5);
    expect(arcs[1].radius).toBeLessThan(arcs[0].radius);
  });

  it('メモを持たない語には印を描かない', () => {
    const { arcs } = drawAt(2, { scale: 1, offsetX: 0, offsetY: 0 }, { nodes: [node()], links: [], timeLinks: [], layers: [], clusterLanes: [] });

    expect(arcs).toHaveLength(1);
  });
});
