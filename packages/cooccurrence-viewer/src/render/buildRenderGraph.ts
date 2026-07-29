import {
  noteBearingIndexes,
  readCooccurrenceSliceValue,
  readLink,
  type CooccurrenceFile,
} from '@anytime-markdown/graph-core';
import type { RenderGraph, RenderLayer, RenderLink, RenderNode, RenderTimeLink, ThemeMode } from '../types';
import { NODE_STROKE_NORMAL, NODE_STROKE_SUBJECT, labelFontSizeForRadius, radiusForFrequency, widthForStrength } from './scales';
import { withAlpha } from './color';
import { clusterColor } from '../theme/readTheme';

function buildClusterIndex(file: CooccurrenceFile): Map<number, number> {
  const index = new Map<number, number>();
  file.spec.clusters?.forEach((cluster, clusterIndex) => {
    cluster.members.forEach((member) => {
      if (!index.has(member)) index.set(member, clusterIndex);
    });
  });
  return index;
}

/** 1 枚のレイヤーに描くもの。`placement` を持たない 1 件だけを渡すと単一表示になる。 */
export interface RenderLayerInput {
  /** レイヤー表示のときの配置。単一表示では省略する。 */
  placement?: RenderLayer;
  visibleNodeIndexes: ReadonlySet<number>;
  visibleLinkIndexes: ReadonlySet<number>;
}

export interface BuildRenderGraphOptions {
  file: CooccurrenceFile;
  positions: readonly (readonly [number, number])[];
  themeTarget: HTMLElement;
  mode: ThemeMode;
  layers: readonly RenderLayerInput[];
  /** レイヤー間の点線を描くか（設計書 §3.6.3）。単一表示では効かない。 */
  showTimeLinks?: boolean;
}

interface ValueRange {
  min: number;
  max: number;
}

function rangeOf(values: readonly number[]): ValueRange {
  return values.length > 0 ? { min: Math.min(...values), max: Math.max(...values) } : { min: 0, max: 0 };
}

/**
 * 円の大きさ・線の太さの尺度に使う値の範囲。
 *
 * レイヤー表示では**全スライスの値をまとめて**範囲にする。レイヤーごとに範囲を取ると、
 * 全体に値の小さいスライスでも円が最大まで膨らみ、レイヤー間で大きさを比べられなくなる。
 * 時間軸を付ける目的は時期どうしの比較であり、比較できない尺度を各レイヤーに与えては意味がない。
 */
function scaleRanges(file: CooccurrenceFile, layered: boolean): { frequency: ValueRange; strength: ValueRange } {
  const timeline = file.spec.timeline;
  if (!layered || timeline === undefined) {
    return {
      frequency: rangeOf(file.spec.nodes.map((node) => node.frequency)),
      strength: rangeOf(file.spec.links.map((link) => readLink(link).strength)),
    };
  }
  return {
    frequency: rangeOf(timeline.nodes.flatMap((entries) => entries.map((entry) => entry[1]))),
    strength: rangeOf(timeline.links.flatMap((entries) => entries.map((entry) => entry[1]))),
  };
}

/**
 * レイヤー間の点線。隣り合う**スライス**の両方に描かれた語だけを結ぶ（設計書 §3.6.3・§3.6.5）。
 *
 * Why not 描画レイヤーの隣接で判定するか: 表示するスライスを絞ると、落としたスライスの分は
 * 詰めてレイヤー番号を振り直す（`computeLayerPlacements`）。レイヤー番号の隣接で結ぶと、
 * 隠したスライスを挟む 2 枚が直接つながり、その間に何があったか分からないまま「全期間を通して
 * 存在し続けた」のと同じ見た目になる。判定はスライスの添字で行う。
 */
function buildTimeLinks(
  nodesByLayer: readonly RenderNode[][],
  placements: readonly RenderLayer[],
): RenderTimeLink[] {
  const timeLinks: RenderTimeLink[] = [];
  for (let layer = 0; layer + 1 < nodesByLayer.length; layer++) {
    if (placements[layer + 1]?.slice !== (placements[layer]?.slice ?? -1) + 1) continue;
    const next = new Map(nodesByLayer[layer + 1].map((node) => [node.index, node]));
    for (const node of nodesByLayer[layer]) {
      const partner = next.get(node.index);
      // 片方に無ければ結ばない。途切れそのものが「一度退場した」という読み取れる情報である。
      if (partner === undefined) continue;
      timeLinks.push({
        nodeIndex: node.index,
        fromLayer: layer,
        toLayer: layer + 1,
        x1: node.x,
        y1: node.y,
        x2: partner.x,
        y2: partner.y,
      });
    }
  }
  return timeLinks;
}

export function buildRenderGraph(options: BuildRenderGraphOptions): RenderGraph {
  const { file, positions, themeTarget, mode } = options;
  const layered = options.layers.some((layer) => layer.placement !== undefined);
  const ranges = scaleRanges(file, layered);
  const clusterIndex = buildClusterIndex(file);
  const notedNodes = noteBearingIndexes(file.spec, 'nodes');
  const notedLinks = noteBearingIndexes(file.spec, 'links');
  const views = file.spec.links.map(readLink);

  const nodesByLayer: RenderNode[][] = [];
  const links: RenderLink[] = [];
  const placements: RenderLayer[] = [];

  options.layers.forEach((input, layer) => {
    const slice = input.placement?.slice;
    const offsetX = input.placement?.offsetX ?? 0;
    const offsetY = input.placement?.offsetY ?? 0;
    if (input.placement !== undefined) placements.push(input.placement);

    const frequencyOf = (nodeIndex: number): number | undefined =>
      slice === undefined
        ? file.spec.nodes[nodeIndex].frequency
        : readCooccurrenceSliceValue(file.spec, { target: 'nodes', slice, index: nodeIndex });
    const strengthOf = (linkIndex: number): number | undefined =>
      slice === undefined
        ? views[linkIndex].strength
        : readCooccurrenceSliceValue(file.spec, { target: 'links', slice, index: linkIndex });

    // 語ごとの共起の本数は、そのレイヤーに存在する共起だけを数える。全期間の本数を出すと、
    // 「この時期には 1 本しか結んでいない語」がどのレイヤーでも同じ本数を名乗る。
    const cooccurrenceCounts = new Map<number, number>();
    views.forEach((view, linkIndex) => {
      if (strengthOf(linkIndex) === undefined) return;
      cooccurrenceCounts.set(view.source, (cooccurrenceCounts.get(view.source) ?? 0) + 1);
      cooccurrenceCounts.set(view.target, (cooccurrenceCounts.get(view.target) ?? 0) + 1);
    });

    const layerNodes: RenderNode[] = [];
    file.spec.nodes.forEach((node, index) => {
      if (!input.visibleNodeIndexes.has(index)) return;
      const frequency = frequencyOf(index);
      if (frequency === undefined) return;
      const pos = positions[index] ?? [0, 0];
      const radius = radiusForFrequency(frequency, ranges.frequency.min, ranges.frequency.max);
      const color = clusterColor(themeTarget, clusterIndex.get(index), mode);
      layerNodes.push({
        index,
        layer,
        label: node.label,
        frequency,
        clusterIndex: clusterIndex.get(index),
        x: pos[0] + offsetX,
        y: pos[1] + offsetY,
        radius,
        fill: withAlpha(color, mode === 'dark' ? 0.28 : 0.18),
        stroke: color,
        strokeWidth: file.spec.subject === index ? NODE_STROKE_SUBJECT : NODE_STROKE_NORMAL,
        labelFontSize: labelFontSizeForRadius(radius),
        cooccurrenceCount: cooccurrenceCounts.get(index) ?? 0,
        isSubject: file.spec.subject === index,
        hasNote: notedNodes.has(index),
      });
    });
    nodesByLayer.push(layerNodes);

    views.forEach((view, index) => {
      if (!input.visibleLinkIndexes.has(index)) return;
      const strength = strengthOf(index);
      if (strength === undefined) return;
      links.push({
        index,
        layer,
        source: view.source,
        target: view.target,
        strength,
        width: widthForStrength(strength, ranges.strength.min, ranges.strength.max),
        direction: view.direction,
        hasNote: notedLinks.has(index),
      });
    });
  });

  return {
    nodes: nodesByLayer.flat(),
    links,
    timeLinks: layered && options.showTimeLinks !== false ? buildTimeLinks(nodesByLayer, placements) : [],
    layers: placements,
  };
}
