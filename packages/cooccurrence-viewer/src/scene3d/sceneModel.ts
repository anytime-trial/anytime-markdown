import { LINK_DIRECTION } from '@anytime-markdown/graph-core';
import { computeNeighborhoodHighlight } from '../render/highlight';
import { LINK_DIM_ALPHA, visibleAlpha } from '../render/drawGraph';
import { buildNodeLookup, linkEndpoints } from '../render/nodeLookup';
import type { RenderGraph, RenderLayer, RenderNode } from '../types';

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

export interface OzSceneModel {
  nodes: OzSceneNode[];
  links: OzSceneLink[];
  timeLinks: OzSceneLink[];
  cones: OzSceneCone[];
  labels: OzSceneLabel[];
  layerLabels: OzSceneLabel[];
}

/** レイヤー（時間スライス）どうしの奥行き間隔（世界座標）。 */
export const LAYER_Z_PITCH = 600;
/** 単一表示でクラスタごとに与える奥行き帯の間隔。 */
const CLUSTER_Z_BAND = 90;
/** 決定的ジッタの振れ幅（±）。 */
const Z_JITTER = 60;
/** 選択時に出すラベルの上限。全語ラベルはテクスチャ生成が破綻する（要件書 pre-mortem）。 */
export const LABEL_MAX = 40;
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

export function buildOzSceneModel(graph: RenderGraph, selectedNodeIndex: number | null): OzSceneModel {
  const highlight = computeNeighborhoodHighlight(graph, selectedNodeIndex);
  const lookup = buildNodeLookup(graph.nodes);
  const layered = graph.layers.length > 0;

  const nodes: OzSceneNode[] = [];
  const positionOf = new Map<RenderNode, { x: number; y: number; z: number }>();
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
    links.push({
      x1: source.x,
      y1: source.y,
      z1: source.z,
      x2: target.x,
      y2: target.y,
      z2: target.z,
      width: link.width,
      alpha,
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
    return {
      x1: timeLink.x1 - (from?.offsetX ?? 0),
      y1: -(timeLink.y1 - (from?.offsetY ?? 0)),
      z1: timeLink.fromLayer * LAYER_Z_PITCH,
      x2: timeLink.x2 - (to?.offsetX ?? 0),
      y2: -(timeLink.y2 - (to?.offsetY ?? 0)),
      z2: timeLink.toLayer * LAYER_Z_PITCH,
      width: 1,
      alpha: visibleAlpha(selectedNodeIndex, highlight?.nodeIndexes, timeLink.nodeIndex) * TIME_LINK_ALPHA,
    };
  });

  const labels: OzSceneLabel[] = [];
  if (selectedNodeIndex !== null && highlight) {
    for (const node of graph.nodes) {
      if (labels.length >= LABEL_MAX) break;
      if (!highlight.nodeIndexes.has(node.index)) continue;
      const position = positionOf.get(node);
      if (position === undefined) continue;
      labels.push({ text: node.label, x: position.x, y: position.y + node.radius + 6, z: position.z });
    }
  }

  const layerLabels: OzSceneLabel[] = layered
    ? graph.layers.map((layer) => ({
        text: layer.at === undefined ? layer.label : `${layer.label}（${layer.at}）`,
        x: layer.labelX - layer.offsetX,
        y: -(layer.labelY - layer.offsetY),
        z: layer.layer * LAYER_Z_PITCH,
      }))
    : [];

  return { nodes, links, timeLinks, cones, labels, layerLabels };
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
