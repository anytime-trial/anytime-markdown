import { LINK_DIRECTION } from '@anytime-markdown/graph-core';
import { computeNeighborhoodHighlight } from '../render/highlight';
import { LINK_DIM_ALPHA, visibleAlpha } from '../render/drawGraph';
import { buildNodeLookup, linkEndpoints } from '../render/nodeLookup';
import type { RenderGraph, RenderLayer, RenderLink, RenderNode } from '../types';

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
  timeLinks: OzSceneLink[];
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
/** レイヤー間の点線の基礎透明度（2D の TIME_LINK_ALPHA と同じ値）。 */
const TIME_LINK_ALPHA = 0.45;

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

/**
 * ピルで描く RenderNode の集合。頻度上位 PILL_MAX 語 + 選択近傍（上限より優先）。
 * 上限以内なら全語ピル。
 */
function selectPillNodes(
  nodes: readonly RenderNode[],
  highlightIndexes: ReadonlySet<number> | undefined,
): Set<RenderNode> {
  if (nodes.length <= PILL_MAX) return new Set(nodes);
  const ranked = [...nodes].sort((a, b) => b.frequency - a.frequency || a.index - b.index);
  const pills = new Set(ranked.slice(0, PILL_MAX));
  if (highlightIndexes !== undefined) {
    for (const node of nodes) {
      if (highlightIndexes.has(node.index)) pills.add(node);
    }
  }
  return pills;
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

/** クラスタ見出し。所属ノードの重心にクラスタ色（所属先頭ノードの stroke）で置く。 */
function buildHeadings(
  nodes: readonly RenderNode[],
  positionOf: ReadonlyMap<RenderNode, Point3>,
  clusterLabels: readonly string[],
): OzSceneHeading[] {
  const groups = new Map<number, { sumX: number; sumY: number; sumZ: number; count: number; color: string }>();
  for (const node of nodes) {
    if (node.clusterIndex === undefined) continue;
    const label = clusterLabels[node.clusterIndex];
    if (label === undefined || label === '') continue;
    const position = positionOf.get(node);
    if (position === undefined) continue;
    const group = groups.get(node.clusterIndex) ?? { sumX: 0, sumY: 0, sumZ: 0, count: 0, color: node.stroke };
    group.sumX += position.x;
    group.sumY += position.y;
    group.sumZ += position.z;
    group.count += 1;
    groups.set(node.clusterIndex, group);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([clusterIndex, group]) => ({
      text: clusterLabels[clusterIndex],
      x: group.sumX / group.count,
      y: group.sumY / group.count,
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

  const pillNodes = selectPillNodes(graph.nodes, highlight?.nodeIndexes);
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

  const timeLinks: OzSceneLink[] = graph.timeLinks.map((timeLink) => {
    const from = layerOf(graph.layers, timeLink.fromLayer);
    const to = layerOf(graph.layers, timeLink.toLayer);
    const x1 = timeLink.x1 - (from?.offsetX ?? 0);
    const y1 = -(timeLink.y1 - (from?.offsetY ?? 0));
    const z1 = timeLink.fromLayer * LAYER_Z_PITCH;
    const x2 = timeLink.x2 - (to?.offsetX ?? 0);
    const y2 = -(timeLink.y2 - (to?.offsetY ?? 0));
    const z2 = timeLink.toLayer * LAYER_Z_PITCH;
    return {
      x1,
      y1,
      z1,
      x2,
      y2,
      z2,
      width: 1,
      alpha: visibleAlpha(selectedNodeIndex, highlight?.nodeIndexes, timeLink.nodeIndex) * TIME_LINK_ALPHA,
      // 同一語の連続性を示す点線は膨らませない（曲げると別の語へ繋がって見える）。
      cpX: (x1 + x2) / 2,
      cpY: (y1 + y2) / 2,
      cpZ: (z1 + z2) / 2,
      flow: 0 as const,
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

  return { nodes, links, timeLinks, cones, headings, layerLabels };
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
