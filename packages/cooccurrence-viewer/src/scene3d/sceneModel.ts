import { LINK_DIRECTION } from '@anytime-markdown/graph-core';
import { computeNeighborhoodHighlight } from '../render/highlight';
import { LINK_DIM_ALPHA, visibleAlpha } from '../render/drawGraph';
import { buildNodeLookup, linkEndpoints } from '../render/nodeLookup';
import type { RenderGraph, RenderLayer, RenderLink, RenderNode, RenderTimeLink } from '../types';

/**
 * OZ 3D シーンモデル（要件書 OZ 風 3D 表示 §2.2）。
 *
 * 3D 化の判断（z の導出・レイヤーの奥行き並置・淡色化・円錐・ラベルの選抜）をすべて
 * ここに置き、three.js への反映（ozRenderer）は座標と色を写すだけの薄い層にする。
 * WebGL は jsdom で再現できないため、検査可能な判断をこの純関数へ寄せる（要件書 §5）。
 *
 * 座標系: three.js の右手系（y 上向き）。2D canvas は y 下向きのため符号を反転する。
 */

export interface OzSceneNode {
  index: number;
  layer: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  color: string;
  alpha: number;
  /** 語テキスト。ピル描画（v2）とホバー昇格の表示に使う。 */
  label: string;
  /** true ならピル型ラベルで描く。false は色ドットに縮退する（要件書 §2.2 v2）。 */
  pill: boolean;
}

export interface OzSceneLink {
  x1: number;
  y1: number;
  z1: number;
  x2: number;
  y2: number;
  z2: number;
  /** 2D の線幅（強度の尺度）。WebGL では太さにできないため、濃さへ写す（要件書 §2.2）。 */
  width: number;
  alpha: number;
  /** 二次ベジェの制御点。中点から線分と直交する向きへ離す（直線なら中点のまま）。 */
  cpX: number;
  cpY: number;
  cpZ: number;
  /** 破線を流す向き。1 = source→target、-1 = 逆、0 = 流さない（要件書 §2.2 v2）。 */
  flow: 1 | -1 | 0;
}

/**
 * スライスをまたぐ同一語を束ねる柱（柱表示要件書 §2.1）。
 *
 * 同一語は全レイヤーで同じ (x, y) にあり、z だけが違う。柱はその (x, y) に立つ z 軸平行の
 * 線分であり、区間は 2D の点線（`RenderGraph.timeLinks`）が持つ「隣接スライスの両方に
 * 存在するときだけ結ぶ」規則をそのまま畳んだもの。
 */
export interface OzScenePillar {
  /** 語 index（レイキャストで選択状態へ戻すために持つ）。 */
  nodeIndex: number;
  x: number;
  y: number;
  zFrom: number;
  zTo: number;
  /** 語名ラベルを置く z（区間の中央）。カメラを回しても位置が飛ばない。 */
  labelZ: number;
  /** 区間内の節の最大半径。ラベルの大きさに使う。 */
  radius: number;
  color: string;
  label: string;
  /** 柱本体の不透明度（基礎透明度 PILLAR_ALPHA 込み）。 */
  alpha: number;
  /** 語名ラベルを描くか。上限 PILL_MAX を節のピルと共有する（§4）。 */
  labeled: boolean;
  /** 語名ラベルの不透明度（節のピルと同じ規則）。 */
  labelAlpha: number;
}

export interface OzSceneCone {
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirY: number;
  dirZ: number;
  size: number;
  alpha: number;
}

export interface OzSceneLabel {
  text: string;
  x: number;
  y: number;
  z: number;
}

/** クラスタ見出し（参考画像の「TOOLS / OUTPUT」相当。要件書 §2.2 v2）。 */
export interface OzSceneHeading {
  text: string;
  x: number;
  y: number;
  z: number;
  color: string;
}

export interface OzSceneModel {
  nodes: OzSceneNode[];
  links: OzSceneLink[];
  /** スライスをまたぐ同一語の柱。3D では点線の代わりにこれを描く（柱表示要件書 §2.6）。 */
  pillars: OzScenePillar[];
  cones: OzSceneCone[];
  headings: OzSceneHeading[];
  layerLabels: OzSceneLabel[];
}

/** レイヤー（時間スライス）どうしの奥行き間隔（世界座標）。 */
export const LAYER_Z_PITCH = 600;
/** 単一表示でクラスタごとに与える奥行き帯の間隔。 */
const CLUSTER_Z_BAND = 90;
/** 決定的ジッタの振れ幅（±）。 */
const Z_JITTER = 60;
/**
 * 常時ピル表示の上限。全語の常時ピルはテクスチャ生成と透明スプライトの重なりで
 * 描画が破綻する（要件書 §2.2 v2・pre-mortem）。上限から漏れた語は色ドットに縮退する。
 */
export const PILL_MAX = 250;
/** 曲線の膨らみ量（線分長に対する比と上限）。 */
const CURVE_BOW_RATIO = 0.16;
const CURVE_BOW_MAX = 140;
/**
 * 柱の基礎透明度。
 *
 * Why not 2D の点線と同じ 0.45 か: 点線は破線なので薄くても目に付くが、柱は細い実線であり、
 * 0.45 ではライトの白背景に沈んで同一語の軸を追えなかった（実測 2026-07-31）。柱は同一性を
 * 担う主役なので、線（淡グレー）より濃くする。
 */
const PILLAR_ALPHA = 0.7;

/**
 * 語 index から決める決定的ジッタ。乱数を使うと再描画のたびに球が動く。
 * Knuth の乗法ハッシュで下位ビットの偏りを避ける。
 */
function jitter(index: number): number {
  return (((index * 2654435761) >>> 16) % (Z_JITTER * 2 + 1)) - Z_JITTER;
}

/** 単一表示の z。クラスタで帯を分け、帯の中で語ごとに散らす。 */
function clusterZ(clusterIndex: number | undefined, index: number): number {
  const band = ((clusterIndex ?? 8) % 9) - 4;
  return band * CLUSTER_Z_BAND + jitter(index);
}

function layerOf(layers: readonly RenderLayer[], layer: number): RenderLayer | undefined {
  return layers[layer];
}

/** 2D のレイヤー平行移動を外した三次元位置。レイヤーは z 方向へ並置する（要件書 §2.2）。 */
function nodePosition(node: RenderNode, layers: readonly RenderLayer[]): { x: number; y: number; z: number } {
  const layer = layerOf(layers, node.layer);
  if (layer === undefined) {
    return { x: node.x, y: -node.y, z: clusterZ(node.clusterIndex, node.index) };
  }
  return { x: node.x - layer.offsetX, y: -(node.y - layer.offsetY), z: node.layer * LAYER_Z_PITCH };
}

/** レイヤーをまたぐ語を (語 index, レイヤー) で引くための鍵。 */
function nodeKey(index: number, layer: number): string {
  return `${index}:${layer}`;
}

/** 柱の区間。ラベルの有無を決める前の中間表現。 */
interface PillarSegment {
  nodeIndex: number;
  fromLayer: number;
  toLayer: number;
  x: number;
  y: number;
  radius: number;
  color: string;
  label: string;
  /** 区間内の最大頻度。ラベル上限の順位付けに使う。 */
  frequency: number;
}

/** 柱の区間（語とレイヤーの範囲）。同型の number が 3 つ並ぶため、引数で散らさず 1 つにまとめる。 */
interface PillarRange {
  nodeIndex: number;
  fromLayer: number;
  toLayer: number;
}

function segmentOf(
  range: PillarRange,
  nodeAt: ReadonlyMap<string, RenderNode>,
  layers: readonly RenderLayer[],
): PillarSegment | null {
  const { nodeIndex, fromLayer, toLayer } = range;
  let first: RenderNode | undefined;
  let radius = 0;
  let frequency = 0;
  for (let layer = fromLayer; layer <= toLayer; layer++) {
    const node = nodeAt.get(nodeKey(nodeIndex, layer));
    if (node === undefined) continue;
    if (first === undefined) first = node;
    radius = Math.max(radius, node.radius);
    frequency = Math.max(frequency, node.frequency);
  }
  if (first === undefined) return null;
  const position = nodePosition(first, layers);
  return {
    nodeIndex,
    fromLayer,
    toLayer,
    x: position.x,
    y: position.y,
    radius,
    color: first.stroke,
    label: first.label,
    frequency,
  };
}

/**
 * 点線を語ごとに連結して柱の区間へ畳む（柱表示要件書 §2.2）。
 *
 * 区間の規則は点線から受け継ぐ。点線は「隣接スライスの両方に存在するときだけ結ぶ」ため、
 * 連結できない箇所がそのまま柱の切れ目になる。欠損区間は補間しない。
 */
function buildPillarSegments(
  timeLinks: readonly RenderTimeLink[],
  nodeAt: ReadonlyMap<string, RenderNode>,
  layers: readonly RenderLayer[],
): PillarSegment[] {
  const byNode = new Map<number, RenderTimeLink[]>();
  for (const timeLink of timeLinks) {
    const list = byNode.get(timeLink.nodeIndex);
    if (list === undefined) byNode.set(timeLink.nodeIndex, [timeLink]);
    else list.push(timeLink);
  }
  const segments: PillarSegment[] = [];
  for (const [nodeIndex, links] of [...byNode.entries()].sort(([a], [b]) => a - b)) {
    const sorted = [...links].sort((a, b) => a.fromLayer - b.fromLayer);
    let range: PillarRange = { nodeIndex, fromLayer: sorted[0].fromLayer, toLayer: sorted[0].toLayer };
    for (const link of sorted.slice(1)) {
      if (link.fromLayer === range.toLayer) {
        range = { ...range, toLayer: link.toLayer };
        continue;
      }
      const segment = segmentOf(range, nodeAt, layers);
      if (segment !== null) segments.push(segment);
      range = { nodeIndex, fromLayer: link.fromLayer, toLayer: link.toLayer };
    }
    const last = segmentOf(range, nodeAt, layers);
    if (last !== null) segments.push(last);
  }
  return segments;
}

/** 柱に覆われた (語, レイヤー) の集合。ここに入る節は語名を柱ラベルへ譲る。 */
function coveredNodeKeys(segments: readonly PillarSegment[]): Set<string> {
  const covered = new Set<string>();
  for (const segment of segments) {
    for (let layer = segment.fromLayer; layer <= segment.toLayer; layer++) {
      covered.add(nodeKey(segment.nodeIndex, layer));
    }
  }
  return covered;
}

type LabelCandidate =
  | { kind: 'pillar'; frequency: number; index: number; segment: PillarSegment }
  | { kind: 'node'; frequency: number; index: number; node: RenderNode };

/**
 * 語名ラベルを描く対象。頻度上位 PILL_MAX + 選択近傍（上限より優先）。上限以内なら全て描く。
 *
 * 柱ラベルと節のピルは同じ上限を分け合う（柱表示要件書 §4）。柱を上限の外に置くと、
 * 1000 語規模でスプライトが上限なく増える。
 *
 * Why not 覆われた節の除外を呼び出し側でやるか: 除外を外に置くと、選択近傍の昇格ループ
 * （下）は渡された集合をそのまま昇格させるため、「柱を持つ語は昇格させない」（要件書 §2.3）が
 * 呼び出し側の書き方だけに依存する。除外と昇格を同じ関数に収め、シームが外れないようにする。
 */
function selectLabelTargets(input: {
  segments: readonly PillarSegment[];
  /** 全ての節。柱に覆われたものはこの関数が除外する。 */
  nodes: readonly RenderNode[];
  covered: ReadonlySet<string>;
  highlightIndexes: ReadonlySet<number> | undefined;
}): { pillars: Set<PillarSegment>; nodes: Set<RenderNode> } {
  const { segments, covered, highlightIndexes } = input;
  const nodes = input.nodes.filter((node) => !covered.has(nodeKey(node.index, node.layer)));
  if (segments.length + nodes.length <= PILL_MAX) {
    return { pillars: new Set(segments), nodes: new Set(nodes) };
  }
  const candidates: LabelCandidate[] = [
    ...segments.map<LabelCandidate>((segment) => ({
      kind: 'pillar',
      frequency: segment.frequency,
      index: segment.nodeIndex,
      segment,
    })),
    ...nodes.map<LabelCandidate>((node) => ({
      kind: 'node',
      frequency: node.frequency,
      index: node.index,
      node,
    })),
  ];
  candidates.sort((a, b) => b.frequency - a.frequency || a.index - b.index);
  const pillars = new Set<PillarSegment>();
  const pillNodes = new Set<RenderNode>();
  for (const candidate of candidates.slice(0, PILL_MAX)) {
    if (candidate.kind === 'pillar') pillars.add(candidate.segment);
    else pillNodes.add(candidate.node);
  }
  if (highlightIndexes !== undefined) {
    for (const segment of segments) {
      if (highlightIndexes.has(segment.nodeIndex)) pillars.add(segment);
    }
    for (const node of nodes) {
      if (highlightIndexes.has(node.index)) pillNodes.add(node);
    }
  }
  return { pillars, nodes: pillNodes };
}

interface Point3 {
  x: number;
  y: number;
  z: number;
}

/**
 * 二次ベジェの制御点。中点から xy 平面内の直交方向へ、線分長に比例して膨らませる。
 * 膨らみの側は link index で決める（乱数を使うと再描画のたびに曲がりが変わる）。
 */
function controlPoint(p1: Point3, p2: Point3, linkIndex: number): Point3 {
  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, z: (p1.z + p2.z) / 2 };
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = p2.z - p1.z;
  const length = Math.hypot(dx, dy, dz);
  const horizontal = Math.hypot(dx, dy);
  if (length < 1e-6) return mid;
  // 線分が z 軸へ沿うときだけ x 方向へ逃がす（xy 直交ベクトルが定まらないため）。
  const perp = horizontal < 1e-6 ? { x: 1, y: 0, z: 0 } : { x: -dy / horizontal, y: dx / horizontal, z: 0 };
  const bow = Math.min(length * CURVE_BOW_RATIO, CURVE_BOW_MAX) * (linkIndex % 2 === 0 ? 1 : -1);
  return { x: mid.x + perp.x * bow, y: mid.y + perp.y * bow, z: mid.z + perp.z * bow };
}

/** 破線を流す向き（要件書 §2.2 v2）。both は向きが定まらないため流さない。 */
function flowOf(direction: RenderLink['direction']): 1 | -1 | 0 {
  if (direction === LINK_DIRECTION.backward) return -1;
  if (direction === LINK_DIRECTION.both) return 0;
  return 1;
}

/** 見出しをクラスタ上端からどれだけ持ち上げるか（世界座標）。重心のままだとピルの山に埋もれる。 */
const HEADING_LIFT = 60;

/** クラスタ見出し。重心 x/z・上端より上の y に、クラスタ色（所属先頭ノードの stroke）で置く。 */
function buildHeadings(
  nodes: readonly RenderNode[],
  positionOf: ReadonlyMap<RenderNode, Point3>,
  clusterLabels: readonly string[],
): OzSceneHeading[] {
  const groups = new Map<number, { sumX: number; maxY: number; sumZ: number; count: number; color: string }>();
  for (const node of nodes) {
    if (node.clusterIndex === undefined) continue;
    const label = clusterLabels[node.clusterIndex];
    if (label === undefined || label === '') continue;
    const position = positionOf.get(node);
    if (position === undefined) continue;
    const group = groups.get(node.clusterIndex) ?? { sumX: 0, maxY: -Infinity, sumZ: 0, count: 0, color: node.stroke };
    group.sumX += position.x;
    group.maxY = Math.max(group.maxY, position.y);
    group.sumZ += position.z;
    group.count += 1;
    groups.set(node.clusterIndex, group);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([clusterIndex, group]) => ({
      text: clusterLabels[clusterIndex],
      x: group.sumX / group.count,
      y: group.maxY + HEADING_LIFT,
      z: group.sumZ / group.count,
      color: group.color,
    }));
}

export function buildOzSceneModel(
  graph: RenderGraph,
  selectedNodeIndex: number | null,
  clusterLabels: readonly string[] = [],
): OzSceneModel {
  const highlight = computeNeighborhoodHighlight(graph, selectedNodeIndex);
  const lookup = buildNodeLookup(graph.nodes);
  const layered = graph.layers.length > 0;

  const nodeAt = new Map(graph.nodes.map((node) => [nodeKey(node.index, node.layer), node]));
  const segments = buildPillarSegments(graph.timeLinks, nodeAt, graph.layers);
  // 柱に属する節は語名を柱ラベルへ譲り、色ドットへ縮退する（柱表示要件書 §2.3）。
  const labelTargets = selectLabelTargets({
    segments,
    nodes: graph.nodes,
    covered: coveredNodeKeys(segments),
    highlightIndexes: highlight?.nodeIndexes,
  });
  const pillNodes = labelTargets.nodes;
  const nodes: OzSceneNode[] = [];
  const positionOf = new Map<RenderNode, Point3>();
  for (const node of graph.nodes) {
    const position = nodePosition(node, graph.layers);
    positionOf.set(node, position);
    nodes.push({
      index: node.index,
      layer: node.layer,
      ...position,
      radius: node.radius,
      color: node.stroke,
      alpha: visibleAlpha(selectedNodeIndex, highlight?.nodeIndexes, node.index),
      label: node.label,
      pill: pillNodes.has(node),
    });
  }

  const links: OzSceneLink[] = [];
  const cones: OzSceneCone[] = [];
  for (const link of graph.links) {
    const endpoints = linkEndpoints(lookup, link);
    if (endpoints === null) continue;
    const source = positionOf.get(endpoints.source);
    const target = positionOf.get(endpoints.target);
    if (source === undefined || target === undefined) continue;
    const alpha = selectedNodeIndex === null || highlight?.linkIndexes.has(link.index) ? 1 : LINK_DIM_ALPHA;
    const cp = controlPoint(source, target, link.index);
    links.push({
      x1: source.x,
      y1: source.y,
      z1: source.z,
      x2: target.x,
      y2: target.y,
      z2: target.z,
      width: link.width,
      alpha,
      cpX: cp.x,
      cpY: cp.y,
      cpZ: cp.z,
      flow: flowOf(link.direction),
    });
    const size = 4 + link.width * 2;
    if (link.direction === LINK_DIRECTION.forward || link.direction === LINK_DIRECTION.both) {
      const cone = coneAt(source, target, endpoints.target.radius, size, alpha);
      if (cone !== null) cones.push(cone);
    }
    if (link.direction === LINK_DIRECTION.backward || link.direction === LINK_DIRECTION.both) {
      const cone = coneAt(target, source, endpoints.source.radius, size, alpha);
      if (cone !== null) cones.push(cone);
    }
  }

  const pillars: OzScenePillar[] = segments.map((segment) => {
    const labelAlpha = visibleAlpha(selectedNodeIndex, highlight?.nodeIndexes, segment.nodeIndex);
    return {
      nodeIndex: segment.nodeIndex,
      x: segment.x,
      y: segment.y,
      zFrom: segment.fromLayer * LAYER_Z_PITCH,
      zTo: segment.toLayer * LAYER_Z_PITCH,
      labelZ: ((segment.fromLayer + segment.toLayer) / 2) * LAYER_Z_PITCH,
      radius: segment.radius,
      color: segment.color,
      label: segment.label,
      alpha: labelAlpha * PILLAR_ALPHA,
      labeled: labelTargets.pillars.has(segment),
      labelAlpha,
    };
  });

  const headings = buildHeadings(graph.nodes, positionOf, clusterLabels);

  const layerLabels: OzSceneLabel[] = layered
    ? graph.layers.map((layer) => ({
        text: layer.at === undefined ? layer.label : `${layer.label}（${layer.at}）`,
        x: layer.labelX - layer.offsetX,
        y: -(layer.labelY - layer.offsetY),
        z: layer.layer * LAYER_Z_PITCH,
      }))
    : [];

  return { nodes, links, pillars, cones, headings, layerLabels };
}

/**
 * 矢印の円錐。target の球面から少し手前へ、線に沿った向きで置く。
 * 端点が一致する（自己共起は検証で拒否されるが座標一致はあり得る）場合は向きが定まらないため置かない。
 */
function coneAt(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  targetRadius: number,
  size: number,
  alpha: number,
): OzSceneCone | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dy, dz);
  if (length === 0) return null;
  const dirX = dx / length;
  const dirY = dy / length;
  const dirZ = dz / length;
  const back = targetRadius + size;
  return {
    x: to.x - dirX * back,
    y: to.y - dirY * back,
    z: to.z - dirZ * back,
    dirX,
    dirY,
    dirZ,
    size,
    alpha,
  };
}
