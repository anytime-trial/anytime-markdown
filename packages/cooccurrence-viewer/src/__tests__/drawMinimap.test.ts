import { LINK_DIRECTION } from '@anytime-markdown/graph-core';
import { drawMinimap } from '../render/drawMinimap';
import { minimapViewport, visibleRect } from '../ui/minimapModel';
import type { CooccurrenceTheme } from '../theme/readTheme';
import type { RenderGraph, RenderNode } from '../types';

interface Recorded {
  ctx: CanvasRenderingContext2D;
  arcs: Array<{ x: number; y: number; radius: number }>;
  texts: string[];
  strokeRects: Array<{ x: number; y: number; width: number; height: number }>;
  lines: number;
}

function createRecordingContext(): Recorded {
  const arcs: Recorded['arcs'] = [];
  const texts: string[] = [];
  const strokeRects: Recorded['strokeRects'] = [];
  let lines = 0;

  const ctx = {
    save(): void {},
    restore(): void {},
    clearRect(): void {},
    fillRect(): void {},
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
      strokeRects.push({ x, y, width, height });
    },
    fillText(text: string): void {
      texts.push(text);
    },
    measureText: (text: string) => ({ width: text.length * 8 }),
    set fillStyle(_v: string) {},
    set strokeStyle(_v: string) {},
    set lineWidth(_v: number) {},
    set font(_v: string) {},
    set globalAlpha(_v: number) {},
  } as unknown as CanvasRenderingContext2D;

  return { ctx, arcs, texts, strokeRects, get lines() { return lines; } } as Recorded;
}

function node(overrides: Partial<RenderNode> = {}): RenderNode {
  return {
    index: 0,
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
    mutedAlpha: 0.2,
  };
}

const SIZE = { width: 240, height: 120 };
const GRAPH: RenderGraph = {
  nodes: [node({ index: 0, x: -100, y: -50 }), node({ index: 1, x: 100, y: 50 })],
  links: [{ index: 0, source: 0, target: 1, strength: 3, width: 2, direction: LINK_DIRECTION.none, hasNote: false }],
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

  it('draws nothing but the background for an empty graph', () => {
    const recorded = draw({ nodes: [], links: [] }, null);

    expect(recorded.arcs).toEqual([]);
    expect(recorded.lines).toBe(0);
  });
});
