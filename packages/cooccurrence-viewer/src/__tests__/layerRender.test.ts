/**
 * @jest-environment jsdom
 */
import {
  addCooccurrenceSlice,
  filterCooccurrenceFile,
  setCooccurrenceLinkSliceValue,
  setCooccurrenceNodeSliceValue,
  type CooccurrenceEditResult,
  type CooccurrenceFile,
} from '@anytime-markdown/graph-core';
import { buildRenderGraph, type RenderLayerInput } from '../render/buildRenderGraph';
import { computeLayerPlacements, layerPitch, unionBounds } from '../render/layerLayout';
import { buildNodeLookup, linkEndpoints } from '../render/nodeLookup';
import { drawGraph } from '../render/drawGraph';
import { hitTestLink } from '../viewport/hitTest';
import { RADIUS_MAX, RADIUS_MIN } from '../render/scales';
import type { CooccurrenceTheme } from '../theme/readTheme';
import type { RenderGraph } from '../types';

function unwrap(result: CooccurrenceEditResult): CooccurrenceFile {
  if (!result.ok) throw new Error(result.errors.map((e) => `${e.code}: ${e.message}`).join('; '));
  return result.file;
}

const POSITIONS: [number, number][] = [
  [0, 0],
  [100, 0],
  [0, 100],
];

function baseFile(): CooccurrenceFile {
  return {
    meta: { schemaVersion: 1, generatedAt: '2026-07-29T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: 'A', frequency: 10 },
        { label: 'B', frequency: 4 },
        { label: 'C', frequency: 6 },
      ],
      links: [
        [0, 1, 0.9],
        [1, 2, 0.5],
      ],
    },
  };
}

/**
 * 3 スライスの図。
 * - 語 A: 全スライス（10 / 3 / 2）
 * - 語 B: 1 月と 3 月のみ（4 / — / 5）→ 2 月で途切れる
 * - 語 C: 1 月のみ（6）
 */
function timelineFile(): CooccurrenceFile {
  let file = unwrap(addCooccurrenceSlice(baseFile(), { label: '1月', at: '2026-01-01' }));
  file = unwrap(addCooccurrenceSlice(file, { label: '2月', at: '2026-02-01' }));
  file = unwrap(addCooccurrenceSlice(file, { label: '3月', at: '2026-03-01' }));
  file = unwrap(setCooccurrenceNodeSliceValue(file, { node: 0, slice: 1 }, 3));
  file = unwrap(setCooccurrenceNodeSliceValue(file, { node: 0, slice: 2 }, 2));
  file = unwrap(setCooccurrenceNodeSliceValue(file, { node: 1, slice: 2 }, 5));
  file = unwrap(setCooccurrenceLinkSliceValue(file, { link: 0, slice: 2 }, 0.3));
  return file;
}

function themeTarget(): HTMLElement {
  return document.createElement('div');
}

function buildLayers(
  file: CooccurrenceFile,
  options: { gap?: number; showTimeLinks?: boolean; visibleSliceIndexes?: number[] } = {},
): RenderGraph {
  const slices = file.spec.timeline?.slices ?? [];
  const placements = computeLayerPlacements({
    slices,
    visibleSliceIndexes: options.visibleSliceIndexes ?? slices.map((_slice, index) => index),
    bounds: unionBounds(POSITIONS, RADIUS_MAX),
    axis: 'horizontal',
    gap: options.gap ?? 160,
  });
  const layers: RenderLayerInput[] = placements.map((placement) => {
    const filtered = filterCooccurrenceFile(file, { sliceIndex: placement.slice });
    return {
      placement,
      visibleNodeIndexes: filtered.nodeIndexes,
      visibleLinkIndexes: filtered.linkIndexes,
    };
  });
  return buildRenderGraph({
    file,
    positions: POSITIONS,
    themeTarget: themeTarget(),
    mode: 'light',
    layers,
    showTimeLinks: options.showTimeLinks,
  });
}

function buildSingle(file: CooccurrenceFile): RenderGraph {
  const filtered = filterCooccurrenceFile(file, {});
  return buildRenderGraph({
    file,
    positions: POSITIONS,
    themeTarget: themeTarget(),
    mode: 'light',
    layers: [{ visibleNodeIndexes: filtered.nodeIndexes, visibleLinkIndexes: filtered.linkIndexes }],
  });
}

describe('単一表示（従来の図）', () => {
  it('レイヤーを持たず、点線も引かない', () => {
    const graph = buildSingle(timelineFile());
    expect(graph.layers).toEqual([]);
    expect(graph.timeLinks).toEqual([]);
    expect(graph.nodes.every((node) => node.layer === 0)).toBe(true);
  });

  it('円の大きさは全体値で決まる', () => {
    const graph = buildSingle(timelineFile());
    const a = graph.nodes.find((node) => node.index === 0);
    // 全体値は 10 + 3 + 2 = 15 で、この図の最大値。
    expect(a?.frequency).toBe(15);
    expect(a?.radius).toBe(RADIUS_MAX);
  });
});

describe('レイヤーの配置', () => {
  it('レイヤーは和集合の外接矩形 + 余白の間隔で並ぶ', () => {
    const bounds = unionBounds(POSITIONS, RADIUS_MAX);
    const pitch = layerPitch(bounds, 'horizontal', 160);
    // 座標の幅 100 + 半径上限 64 × 2 + 余白 160。
    expect(pitch).toBe(100 + RADIUS_MAX * 2 + 160);

    const graph = buildLayers(timelineFile());
    expect(graph.layers.map((layer) => layer.label)).toEqual(['1月', '2月', '3月']);
    expect(graph.layers.map((layer) => layer.offsetX)).toEqual([0, pitch, pitch * 2]);
    expect(graph.layers.every((layer) => layer.offsetY === 0)).toBe(true);
  });

  it('縦並びでは y へオフセットが入る', () => {
    const slices = timelineFile().spec.timeline?.slices ?? [];
    const placements = computeLayerPlacements({
      slices,
      visibleSliceIndexes: [0, 1, 2],
      bounds: unionBounds(POSITIONS, RADIUS_MAX),
      axis: 'vertical',
      gap: 100,
    });
    expect(placements.every((placement) => placement.offsetX === 0)).toBe(true);
    // y の座標の幅 100 + 半径上限 64 × 2 + 余白 100 = 328。
    expect(placements.map((placement) => placement.offsetY)).toEqual([0, 328, 656]);
  });

  it('同じ語はどのレイヤーでも同じ相対位置に置かれる', () => {
    const graph = buildLayers(timelineFile());
    const pitch = layerPitch(unionBounds(POSITIONS, RADIUS_MAX), 'horizontal', 160);
    const a = graph.nodes.filter((node) => node.index === 0).sort((x, y) => x.layer - y.layer);
    expect(a.map((node) => node.x)).toEqual([0, pitch, pitch * 2]);
    expect(a.map((node) => node.y)).toEqual([0, 0, 0]);
  });

  it('表示するスライスを絞ると、落とした分の空きは詰める', () => {
    const slices = timelineFile().spec.timeline?.slices ?? [];
    const placements = computeLayerPlacements({
      slices,
      visibleSliceIndexes: [0, 2],
      bounds: unionBounds(POSITIONS, RADIUS_MAX),
      axis: 'horizontal',
      gap: 160,
    });
    const pitch = layerPitch(unionBounds(POSITIONS, RADIUS_MAX), 'horizontal', 160);
    expect(placements.map((placement) => placement.slice)).toEqual([0, 2]);
    expect(placements.map((placement) => placement.offsetX)).toEqual([0, pitch]);
  });
});

describe('レイヤーごとの値', () => {
  it('円の大きさはそのスライスの頻度で決まる', () => {
    const graph = buildLayers(timelineFile());
    const a = graph.nodes.filter((node) => node.index === 0).sort((x, y) => x.layer - y.layer);
    expect(a.map((node) => node.frequency)).toEqual([10, 3, 2]);
    expect(a[0].radius).toBeGreaterThan(a[1].radius);
    expect(a[1].radius).toBeGreaterThan(a[2].radius);
  });

  it('尺度は全スライス共通で、値の小さいスライスの円が最大まで膨らまない', () => {
    const graph = buildLayers(timelineFile());
    // 全スライスを通じた最大は 1 月の語 A（10）。3 月の最大は語 B（5）であり、
    // レイヤーごとに尺度を取っていればこれが RADIUS_MAX になってしまう。
    const march = graph.nodes.filter((node) => node.layer === 2);
    expect(Math.max(...march.map((node) => node.radius))).toBeLessThan(RADIUS_MAX);
    const january = graph.nodes.filter((node) => node.layer === 0);
    expect(Math.max(...january.map((node) => node.radius))).toBe(RADIUS_MAX);
  });

  it('そのスライスに存在しない語はそのレイヤーに現れない', () => {
    const graph = buildLayers(timelineFile());
    const february = graph.nodes.filter((node) => node.layer === 1).map((node) => node.index);
    expect(february).toEqual([0]);
    const march = graph.nodes.filter((node) => node.layer === 2).map((node) => node.index).sort();
    expect(march).toEqual([0, 1]);
  });

  it('そのスライスに存在しない共起はそのレイヤーに現れない', () => {
    const graph = buildLayers(timelineFile());
    expect(graph.links.filter((link) => link.layer === 1)).toEqual([]);
    expect(graph.links.filter((link) => link.layer === 2).map((link) => link.index)).toEqual([0]);
  });

  it('共起の本数はそのレイヤーに存在する共起だけを数える', () => {
    const graph = buildLayers(timelineFile());
    const januaryA = graph.nodes.find((node) => node.layer === 0 && node.index === 0);
    const marchA = graph.nodes.find((node) => node.layer === 2 && node.index === 0);
    expect(januaryA?.cooccurrenceCount).toBe(1);
    expect(marchA?.cooccurrenceCount).toBe(1);
    const februaryA = graph.nodes.find((node) => node.layer === 1 && node.index === 0);
    expect(februaryA?.cooccurrenceCount).toBe(0);
  });
});

describe('レイヤー間の点線', () => {
  it('隣り合うレイヤーの両方にある語だけを結ぶ', () => {
    const graph = buildLayers(timelineFile());
    // 1月→2月: A のみ（B と C は 2 月に無い）。2月→3月: A のみ。
    expect(graph.timeLinks.map((timeLink) => [timeLink.fromLayer, timeLink.nodeIndex])).toEqual([
      [0, 0],
      [1, 0],
    ]);
  });

  it('途中のレイヤーで消えた語は跨いで結ばない', () => {
    const graph = buildLayers(timelineFile());
    // 語 B は 1 月と 3 月にあるが 2 月に無い。跨いで結ぶ実装ならここに現れる。
    expect(graph.timeLinks.some((timeLink) => timeLink.nodeIndex === 1)).toBe(false);
  });

  it('点線は完全に水平（共通座標なので交差しない）', () => {
    const graph = buildLayers(timelineFile());
    expect(graph.timeLinks.every((timeLink) => timeLink.y1 === timeLink.y2)).toBe(true);
    expect(graph.timeLinks.every((timeLink) => timeLink.x1 < timeLink.x2)).toBe(true);
  });

  it('表示から外したスライスを挟む 2 枚は結ばない', () => {
    // 1月・3月だけを表示する。語 A は 3 枚すべてに存在するため、レイヤー番号の隣接で結ぶ実装
    // では 1月→3月 の点線が引かれ、隠した 2月 に何があったか分からないまま「ずっと存在した」
    // のと同じ見た目になる（設計書 §3.6.5）。
    const graph = buildLayers(timelineFile(), { visibleSliceIndexes: [0, 2] });
    expect(graph.layers.map((layer) => layer.slice)).toEqual([0, 2]);
    expect(graph.nodes.filter((node) => node.index === 0)).toHaveLength(2);
    expect(graph.timeLinks).toEqual([]);
  });

  it('表示から外したスライスが端にあるだけなら、残りは従来どおり結ぶ', () => {
    // 1月・2月を表示（3月だけを外す）。隣接は保たれるので点線は引く。
    const graph = buildLayers(timelineFile(), { visibleSliceIndexes: [0, 1] });
    expect(graph.timeLinks.map((timeLink) => timeLink.nodeIndex)).toEqual([0]);
  });

  it('点線を切ると 1 本も引かない', () => {
    const graph = buildLayers(timelineFile(), { showTimeLinks: false });
    expect(graph.timeLinks).toEqual([]);
    // 図そのものは変わらない。
    expect(graph.nodes.length).toBeGreaterThan(0);
  });
});

describe('レイヤーをまたぐ取り違えの防止', () => {
  it('共起の端点は同じレイヤーの語だけを指す', () => {
    const graph = buildLayers(timelineFile());
    const lookup = buildNodeLookup(graph.nodes);
    for (const link of graph.links) {
      const endpoints = linkEndpoints(lookup, link);
      expect(endpoints).not.toBeNull();
      expect(endpoints?.source.layer).toBe(link.layer);
      expect(endpoints?.target.layer).toBe(link.layer);
    }
  });

  it('別のレイヤーの語を索引が上書きしない', () => {
    const graph = buildLayers(timelineFile());
    const lookup = buildNodeLookup(graph.nodes);
    // 語 A は 3 レイヤーすべてにある。添字だけを鍵にした索引なら 1 件へ潰れる。
    expect(lookup.map((layer) => layer.get(0)?.x)).toHaveLength(3);
    expect(new Set(lookup.map((layer) => layer.get(0)?.x)).size).toBe(3);
  });

  it('線の当たり判定がレイヤーをまたいだ線を作らない', () => {
    const graph = buildLayers(timelineFile());
    const pitch = layerPitch(unionBounds(POSITIONS, RADIUS_MAX), 'horizontal', 160);
    // 1 月の語 A(0,0) と 2 月の語 A(pitch,0) の中点。ここを通る線があってはならない。
    const midpoint = { x: pitch / 2, y: 0 };
    const hit = hitTestLink(graph, midpoint.x, midpoint.y, { scale: 1, offsetX: 0, offsetY: 0 });
    expect(hit).toBeNull();
  });
});

describe('点線の描画', () => {
  function theme(): CooccurrenceTheme {
    return {
      mode: 'light',
      background: '#fff',
      surface: '#eee',
      text: '#000',
      textSecondary: '#333',
      divider: '#ccc',
      accent: '#00f',
      link: '#888',
      mutedAlpha: 0.2,
    };
  }

  interface Recorded {
    dashPatterns: number[][];
    lines: Array<{ from: { x: number; y: number }; to: { x: number; y: number }; dashed: boolean }>;
    layerLabels: string[];
  }

  function draw(graph: RenderGraph): Recorded {
    const dashPatterns: number[][] = [];
    const lines: Recorded['lines'] = [];
    const layerLabels: string[] = [];
    let path: Array<{ x: number; y: number }> = [];
    let dash: number[] = [];
    const ctx = {
      save(): void {},
      restore(): void {
        dash = [];
      },
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
        path = [];
      },
      setLineDash(pattern: number[]): void {
        dash = pattern;
        dashPatterns.push([...pattern]);
      },
      stroke(): void {
        if (path.length === 2) lines.push({ from: path[0], to: path[1], dashed: dash.length > 0 });
      },
      fill(): void {},
      measureText: (text: string) => ({ width: text.length * 8 }),
      fillText(text: string): void {
        layerLabels.push(text);
      },
      set fillStyle(_v: string) {},
      set strokeStyle(_v: string) {},
      set lineWidth(_v: number) {},
      set font(_v: string) {},
      set globalAlpha(_v: number) {},
      get globalAlpha(): number {
        return 1;
      },
      set textAlign(_v: string) {},
      set textBaseline(_v: string) {},
      set lineJoin(_v: string) {},
      set lineCap(_v: string) {},
    } as unknown as CanvasRenderingContext2D;

    drawGraph({
      ctx,
      width: 800,
      height: 400,
      graph,
      viewport: { scale: 1, offsetX: 0, offsetY: 0 },
      theme: theme(),
      selectedNodeIndex: null,
    });
    return { dashPatterns, lines, layerLabels };
  }

  it('共起の実線はレイヤーの帯をまたがない', () => {
    const pitch = layerPitch(unionBounds(POSITIONS, RADIUS_MAX), 'horizontal', 160);
    const bounds = unionBounds(POSITIONS, RADIUS_MAX);
    if (bounds === null) throw new Error('bounds must be defined');
    const bandOf = (x: number): number => Math.round((x - bounds.minX) / pitch);
    const recorded = draw(buildLayers(timelineFile()));
    const solid = recorded.lines.filter((line) => !line.dashed);
    for (const line of solid) {
      expect(bandOf(line.from.x)).toBe(bandOf(line.to.x));
    }
    // 端点の索引がレイヤーを見ていないと、どのレイヤーの共起も先頭レイヤーの語へ引かれ、
    // 実線が 1 つの帯へ集まる。線が引かれたことだけを見る検査ではこの形を捕まえられないため、
    // 「どの帯に何本引かれたか」まで固定する（1月に 2 本・3月に 1 本・2月は 0 本）。
    expect(solid.map((line) => bandOf(line.from.x)).sort()).toEqual([0, 0, 2]);
  });

  it('点線は破線で描き、共起の線は実線のまま', () => {
    const recorded = draw(buildLayers(timelineFile()));
    const dashed = recorded.lines.filter((line) => line.dashed);
    const solid = recorded.lines.filter((line) => !line.dashed);
    expect(dashed).toHaveLength(2);
    expect(solid.length).toBeGreaterThan(0);
    expect(recorded.dashPatterns.length).toBeGreaterThan(0);
  });

  it('単一表示では破線を 1 本も引かない', () => {
    const recorded = draw(buildSingle(timelineFile()));
    expect(recorded.lines.some((line) => line.dashed)).toBe(false);
    expect(recorded.dashPatterns).toEqual([]);
  });

  it('レイヤー名を日付つきで描く', () => {
    const recorded = draw(buildLayers(timelineFile()));
    expect(recorded.layerLabels).toEqual(
      expect.arrayContaining(['1月（2026-01-01）', '2月（2026-02-01）', '3月（2026-03-01）']),
    );
  });

  it('単一表示ではレイヤー名を描かない', () => {
    const recorded = draw(buildSingle(timelineFile()));
    expect(recorded.layerLabels.some((label) => label.includes('2026-01-01'))).toBe(false);
  });
});

describe('絞り込みの基準', () => {
  it('最小出現頻度はレイヤーごとにそのスライスの値で効く', () => {
    const file = timelineFile();
    const slices = file.spec.timeline?.slices ?? [];
    const placements = computeLayerPlacements({
      slices,
      visibleSliceIndexes: [0, 1, 2],
      bounds: unionBounds(POSITIONS, RADIUS_MAX),
      axis: 'horizontal',
      gap: 160,
    });
    const layers: RenderLayerInput[] = placements.map((placement) => {
      const filtered = filterCooccurrenceFile(file, { sliceIndex: placement.slice, minFrequency: 5 });
      return {
        placement,
        visibleNodeIndexes: filtered.nodeIndexes,
        visibleLinkIndexes: filtered.linkIndexes,
      };
    });
    const graph = buildRenderGraph({
      file,
      positions: POSITIONS,
      themeTarget: themeTarget(),
      mode: 'light',
      layers,
    });
    // 語 A は 1 月（10）で残り、2 月（3）と 3 月（2）で外れる。全体値（15）で判定していれば
    // どのレイヤーにも残ってしまう。
    expect(graph.nodes.filter((node) => node.index === 0).map((node) => node.layer)).toEqual([0]);
  });
});

describe('レイヤーが 1 枚も無いとき', () => {
  it('語を持たない図でも間隔の計算が壊れない', () => {
    expect(unionBounds([], RADIUS_MAX)).toBeNull();
    expect(layerPitch(null, 'horizontal', 160)).toBe(160);
    expect(RADIUS_MIN).toBeLessThan(RADIUS_MAX);
  });
});
