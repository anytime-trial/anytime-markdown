/**
 * 思考法ダイアグラム・プリセットが GraphNode / GraphEdge / GraphDocument を
 * 決定的に組み立てるための共有ヘルパー。
 * ID は呼び出し側が与える固定値を使い、SVG 出力を決定的に保つ。
 */

import type { GraphDocument, GraphNode, GraphEdge, NodeType, NodeStyle, EdgeStyle, EndpointShape, RoutingMode } from '../types';
import { FONT_FAMILY } from '../theme';
import type { Point, Rect } from './layout';

export interface NodeOpts {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  fontColor?: string;
  fontSize?: number;
  /** bitmask: 1=bold, 2=italic, 4=underline */
  fontStyle?: number;
  dashed?: boolean;
  borderRadius?: number;
  /** spec 内位置などのデータ駆動メタデータ（SVG では data-metadata 属性として出力される）。 */
  metadata?: Record<string, string | number>;
}

const DEFAULT_FONT_SIZE = 14;

export function mkNode(
  id: string,
  type: NodeType,
  rect: Rect,
  text: string,
  opts: NodeOpts = {},
): GraphNode {
  const style: NodeStyle = {
    fill: opts.fill ?? 'transparent',
    stroke: opts.stroke ?? 'rgba(255,255,255,0.24)',
    strokeWidth: opts.strokeWidth ?? 2,
    fontSize: opts.fontSize ?? DEFAULT_FONT_SIZE,
    fontFamily: FONT_FAMILY,
    fontColor: opts.fontColor,
    fontStyle: opts.fontStyle,
    dashed: opts.dashed,
    borderRadius: opts.borderRadius,
  };
  return {
    id,
    type,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    text,
    style,
    ...(opts.metadata ? { metadata: opts.metadata } : {}),
  };
}

export interface EdgeOpts {
  stroke?: string;
  strokeWidth?: number;
  dashed?: boolean;
  endShape?: EndpointShape;
  label?: string;
  routing?: RoutingMode;
  /** spec 内位置などのデータ駆動メタデータ（SVG では data-metadata として出力され、インライン編集の対象になる）。 */
  metadata?: Record<string, string | number>;
}

function edgeStyle(opts: EdgeOpts): EdgeStyle {
  return {
    stroke: opts.stroke ?? 'rgba(255,255,255,0.4)',
    strokeWidth: opts.strokeWidth ?? 2,
    dashed: opts.dashed,
    endShape: opts.endShape,
    routing: opts.routing,
  };
}

/** ノード間を結ぶ直交コネクタ（矢印つき）。 */
export function connectorEdge(id: string, fromId: string, toId: string, opts: EdgeOpts = {}): GraphEdge {
  return {
    id,
    type: 'connector',
    from: { nodeId: fromId, x: 0, y: 0 },
    to: { nodeId: toId, x: 0, y: 0 },
    style: edgeStyle({ endShape: 'arrow', ...opts }),
    label: opts.label,
    ...(opts.metadata ? { metadata: opts.metadata } : {}),
  };
}

/** 座標を直接指定する直線エッジ（fishbone の骨・mindmap の枝など）。 */
export function lineEdge(id: string, from: Point, to: Point, opts: EdgeOpts = {}): GraphEdge {
  return {
    id,
    type: 'line',
    from: { x: from.x, y: from.y },
    to: { x: to.x, y: to.y },
    style: edgeStyle(opts),
    label: opts.label,
    ...(opts.metadata ? { metadata: opts.metadata } : {}),
  };
}

export function mkDoc(name: string, nodes: GraphNode[], edges: GraphEdge[]): GraphDocument {
  return {
    id: 'thinking-diagram',
    name,
    nodes,
    edges,
    groups: [],
    viewport: { offsetX: 0, offsetY: 0, scale: 1 },
    createdAt: 0,
    updatedAt: 0,
  };
}
