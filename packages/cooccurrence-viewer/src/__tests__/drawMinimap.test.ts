import { LINK_DIRECTION } from '@anytime-markdown/graph-core';
import { drawMinimap } from '../render/drawMinimap';
import { minimapViewport, visibleRect } from '../ui/minimapModel';
import type { CooccurrenceTheme } from '../theme/readTheme';
import type { RenderGraph, RenderNode } from '../types';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Recorded {
  ctx: CanvasRenderingContext2D;
  arcs: Array<{ x: number; y: number; radius: number }>;
  texts: string[];
  strokeRects: Array<Rect & { style: string; lineWidth: number }>;
  fillRects: Array<Rect & { style: string }>;
  lines: number;
}

function createRecordingContext(): Recorded {
  const arcs: Recorded['arcs'] = [];
  const texts: string[] = [];
  const strokeRects: Recorded['strokeRects'] = [];
  const fillRects: Recorded['fillRects'] = [];
  let lines = 0;
  // 色と太さは「どの矩形に何を使ったか」を検査するために持つ。設定した値を捨てると、
  // 枠を背景と同じ色で描いても全通過する。
  let fillStyle = '';
  let strokeStyle = '';
  let lineWidth = 0;

  const ctx = {
    save(): void {},
    restore(): void {},
    clearRect(): void {},
    fillRect(x: number, y: number, width: number, height: number): void {
      fillRects.push({ x, y, width, height, style: fillStyle });
    },
    beginPath(): void {},
    moveTo(): void {},
    lineTo(): void {
      lines += 1;
    },
    stroke(): void {},
    fill(): void {},
    arc(x: number, y: number, radius: number): void {
      arcs.push({ x, y, radius });
    },
    strokeRect(x: number, y: number, width: number, height: number): void {
      strokeRects.push({ x, y, width, height, style: strokeStyle, lineWidth });
    },
    fillText(text: string): void {
      texts.push(text);
    },
    measureText: (text: string) => ({ width: text.length * 8 }),
    set fillStyle(v: string) {
      fillStyle = v;
    },
    set strokeStyle(v: string) {
      strokeStyle = v;
    },
    set lineWidth(v: number) {
      lineWidth = v;
    },
    set font(_v: string) {},
    set globalAlpha(_v: number) {},
  } as unknown as CanvasRenderingContext2D;

  return { ctx, arcs, texts, strokeRects, fillRects, get lines() { return lines; } } as Recorded;
}

function node(overrides: Partial<RenderNode> = {}): RenderNode {
  return {
    index: 0,
    layer: 0,
    label: 'A',
    frequency: 5,
    clusterIndex: undefined,
    x: 0,
    y: 0,
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
    viewportFrame: '#eee',
    viewportFill: 'rgba(255,255,255,0.12)',
    mutedAlpha: 0.2,
  };
}

const SIZE = { width: 240, height: 120 };
const GRAPH: RenderGraph = {
  nodes: [node({ index: 0, x: -100, y: -50 }), node({ index: 1, x: 100, y: 50 })],
  links: [{ index: 0, layer: 0, source: 0, target: 1, strength: 3, width: 2, direction: LINK_DIRECTION.none, hasNote: false }],
  timeLinks: [],
  layers: [], clusterLanes: [],
};

function draw(graph: RenderGraph, frame: ReturnType<typeof visibleRect> | null): Recorded {
  const recording = createRecordingContext();
  drawMinimap({
    ctx: recording.ctx,
    width: SIZE.width,
    height: SIZE.height,
    graph,
    viewport: minimapViewport({ minX: -100, minY: -50, maxX: 100, maxY: 50 }, SIZE),
    frame,
    theme: theme(),
  });
  return recording;
}

describe('minimap drawing', () => {
  it('draws every node and link', () => {
    const recorded = draw(GRAPH, null);

    expect(recorded.arcs).toHaveLength(2);
    expect(recorded.lines).toBe(1);
  });

  it('never draws labels', () => {
    // ミニマップは全体の形を見る面であり、語を読む面ではない（仕様 §3.5）。
    // ラベルを描くと、縮尺のせいで文字が重なり全体の形そのものが見えなくなる。
    const recorded = draw(GRAPH, null);

    expect(recorded.texts).toEqual([]);
  });

  it('keeps circles visible at minimap scale', () => {
    // 240x120 に収める縮尺では半径 12px の円は 1px を割る。消えると全体の形が読めない。
    const recorded = draw(GRAPH, null);

    for (const arc of recorded.arcs) expect(arc.radius).toBeGreaterThanOrEqual(1);
  });

  it('draws the frame only when the visible area is given', () => {
    const mini = minimapViewport({ minX: -100, minY: -50, maxX: 100, maxY: 50 }, SIZE);
    const frame = visibleRect({ scale: 2, offsetX: 400, offsetY: 300 }, { width: 800, height: 600 }, mini);

    expect(draw(GRAPH, frame).strokeRects).toHaveLength(1);
    expect(draw(GRAPH, null).strokeRects).toEqual([]);
  });

  it('fills the visible area as well as outlining it', () => {
    // 線 1 本だけだと、円と線が密なところで枠の内外が追えない。塗りは下の全体像が透ける
    // 濃さで、線はそれより濃く描く（C4 のミニマップと同じ見せ方）。
    const mini = minimapViewport({ minX: -100, minY: -50, maxX: 100, maxY: 50 }, SIZE);
    const frame = visibleRect({ scale: 2, offsetX: 400, offsetY: 300 }, { width: 800, height: 600 }, mini);
    const recorded = draw(GRAPH, frame);

    const outline = recorded.strokeRects[0];
    expect(outline.style).toBe('#eee');
    // 共起の線より太い。同じ太さだと枠が全体像に埋もれる。
    expect(outline.lineWidth).toBeGreaterThan(0.5);

    // 背景の塗り（canvas 全面）と、枠の内側の塗り。枠の塗りは背景色とは別の色で、
    // 線と同じ矩形に重なる。
    const fill = recorded.fillRects.at(-1);
    expect(fill?.style).toBe('rgba(255,255,255,0.12)');
    expect(fill?.style).not.toBe('#000');
    expect({ x: fill?.x, y: fill?.y }).toEqual({ x: outline.x, y: outline.y });
  });

  it('never uses the accent colour for the frame', () => {
    // 差し色は図の中の強調にだけ使う（design.md §1）。常時出ている枠に使うと、
    // どちらが「今の注目」なのかが読めなくなる。
    const mini = minimapViewport({ minX: -100, minY: -50, maxX: 100, maxY: 50 }, SIZE);
    const frame = visibleRect({ scale: 2, offsetX: 400, offsetY: 300 }, { width: 800, height: 600 }, mini);
    const recorded = draw(GRAPH, frame);

    expect(recorded.strokeRects.map((rect) => rect.style)).not.toContain('#f0f');
    expect(recorded.fillRects.map((rect) => rect.style)).not.toContain('#f0f');
  });

  it('draws nothing but the background for an empty graph', () => {
    const recorded = draw({ nodes: [], links: [], timeLinks: [], layers: [], clusterLanes: [] }, null);

    expect(recorded.arcs).toEqual([]);
    expect(recorded.lines).toBe(0);
  });
});
