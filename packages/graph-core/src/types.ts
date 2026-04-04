export type NodeType = 'rect' | 'ellipse' | 'sticky' | 'text' | 'diamond' | 'parallelogram' | 'cylinder' | 'doc' | 'frame' | 'image';
export type EdgeType = 'line' | 'connector';
export type ToolType = 'select' | 'rect' | 'ellipse' | 'sticky' | 'text' | 'diamond' | 'parallelogram' | 'cylinder' | 'doc' | 'frame' | 'line' | 'connector' | 'pan';

export type TextAlign = 'left' | 'center' | 'right';
export type VerticalAlign = 'top' | 'middle' | 'bottom';

export interface NodeStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  fontSize: number;
  fontFamily: string;
  fontColor?: string;
  fontStyle?: number;  // bitmask: 1=bold, 2=italic, 4=underline
  align?: TextAlign;
  verticalAlign?: VerticalAlign;
  opacity?: number;  // 0-100
  dashed?: boolean;
  borderRadius?: number;
  shadow?: boolean;
  gradientTo?: string;
  gradientDirection?: 'vertical' | 'horizontal' | 'diagonal';
  spacing?: number;
  spacingTop?: number;
  spacingRight?: number;
  spacingBottom?: number;
  spacingLeft?: number;
}

export type EndpointShape = 'none' | 'arrow' | 'circle' | 'diamond' | 'bar';
export type RoutingMode = 'orthogonal' | 'bezier' | 'straight';

export interface EdgeStyle {
  stroke: string;
  strokeWidth: number;
  startShape?: EndpointShape;
  endShape?: EndpointShape;
  routing?: RoutingMode;
  opacity?: number;  // 0-100
  dashed?: boolean;
}

export interface GraphNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  style: NodeStyle;
  groupId?: string;
  label?: string;
  labelColor?: string;
  docContent?: string;
  locked?: boolean;
  /** フレーム折りたたみ状態 */
  collapsed?: boolean;
  zIndex?: number;
  /** 画像ノード用: data URL */
  imageData?: string;
  /** 追加の接続ポイント（正規化座標 0-1） */
  extraConnectionPoints?: { x: number; y: number }[];
  /** ハイパーリンクURL */
  url?: string;
  /** データ駆動スタイリング用のメタデータ（任意の key-value） */
  metadata?: Record<string, string | number>;
}

export interface EdgeEndpoint {
  nodeId?: string;
  x: number;
  y: number;
}

export interface GraphEdge {
  id: string;
  type: EdgeType;
  from: EdgeEndpoint;
  to: EdgeEndpoint;
  style: EdgeStyle;
  label?: string;
  /** 手動調整した中間セグメントの位置（直角コネクタ用） */
  manualMidpoint?: number;
  /** ユーザーが手動設定したウェイポイント。設定時は自動直交パスを上書きする */
  manualWaypoints?: { x: number; y: number }[];
  /** 直角コネクタの中間ウェイポイント（resolveEdgeConnections で計算） */
  waypoints?: { x: number; y: number }[];
  /** Bezier パスの制御点列（resolveEdgeConnections で計算） */
  bezierPath?: { x: number; y: number }[];
  /** エッジの重み（0-1）。データ駆動スタイリングで太さに変換される */
  weight?: number;
}

export interface Viewport {
  offsetX: number;
  offsetY: number;
  scale: number;
}

export interface GraphDocument {
  id: string;
  name: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  viewport: Viewport;
  createdAt: number;
  updatedAt: number;
}

export interface SelectionState {
  nodeIds: string[];
  edgeIds: string[];
}

export interface HistoryEntry {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selection?: SelectionState;
}

import {
  COLOR_CHARCOAL, COLOR_BORDER_ACTIVE, FONT_FAMILY,
  STICKY_FILL, STICKY_STROKE,
  DOC_FILL, DOC_STROKE,
  FRAME_FILL, FRAME_STROKE,
  getCanvasColors,
} from './theme';

export const DEFAULT_NODE_STYLE: NodeStyle = {
  fill: COLOR_CHARCOAL,
  stroke: COLOR_BORDER_ACTIVE,
  strokeWidth: 2,
  fontSize: 14,
  fontFamily: FONT_FAMILY,
};

export const DEFAULT_STICKY_STYLE: NodeStyle = {
  fill: STICKY_FILL,
  stroke: STICKY_STROKE,
  strokeWidth: 1,
  fontSize: 14,
  fontFamily: FONT_FAMILY,
};

export const DEFAULT_DOC_STYLE: NodeStyle = {
  fill: DOC_FILL,
  stroke: DOC_STROKE,
  strokeWidth: 1,
  fontSize: 13,
  fontFamily: FONT_FAMILY,
};

export const DEFAULT_FRAME_STYLE: NodeStyle = {
  fill: FRAME_FILL,
  stroke: FRAME_STROKE,
  strokeWidth: 1,
  fontSize: 14,
  fontFamily: FONT_FAMILY,
  borderRadius: 8,
};

export const DEFAULT_EDGE_STYLE: EdgeStyle = {
  stroke: COLOR_BORDER_ACTIVE,
  strokeWidth: 2,
};

/** テーマ対応のデフォルトノードスタイルを返す */
export function getDefaultNodeStyle(isDark: boolean): NodeStyle {
  if (isDark) return { ...DEFAULT_NODE_STYLE };
  return { fill: '#F5F5F0', stroke: 'rgba(0,0,0,0.2)', strokeWidth: 2, fontSize: 14, fontFamily: FONT_FAMILY };
}

/** テーマ対応のデフォルトスタイルマップを返す */
function getStyleMap(isDark: boolean): Partial<Record<NodeType, NodeStyle>> {
  if (isDark) {
    return {
      sticky: { ...DEFAULT_STICKY_STYLE },
      doc: { ...DEFAULT_DOC_STYLE },
      frame: { ...DEFAULT_FRAME_STYLE },
    };
  }
  const colors = getCanvasColors(false);
  return {
    sticky: { ...DEFAULT_STICKY_STYLE },
    doc: { fill: colors.docFill, stroke: colors.docStroke, strokeWidth: 1, fontSize: 13, fontFamily: FONT_FAMILY },
    frame: { fill: colors.frameFill, stroke: colors.frameStroke, strokeWidth: 1, fontSize: 14, fontFamily: FONT_FAMILY, borderRadius: 8 },
  };
}

/** テーマ対応のデフォルトエッジスタイルを返す */
export function getDefaultEdgeStyle(isDark: boolean): EdgeStyle {
  if (isDark) return { ...DEFAULT_EDGE_STYLE };
  return { stroke: 'rgba(0,0,0,0.3)', strokeWidth: 2 };
}

export const DEFAULT_VIEWPORT: Viewport = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
};

export function createNode(type: NodeType, x: number, y: number, overrides?: Partial<GraphNode>, isDark: boolean = true): GraphNode {
  const baseStyle = getStyleMap(isDark)[type] ?? getDefaultNodeStyle(isDark);
  const sizeMap: Partial<Record<NodeType, { width: number; height: number }>> = {
    text: { width: 150, height: 30 },
    diamond: { width: 120, height: 120 },
    parallelogram: { width: 160, height: 80 },
    cylinder: { width: 100, height: 120 },
    doc: { width: 200, height: 120 },
    frame: { width: 400, height: 300 },
    image: { width: 200, height: 150 },
  };
  const size = sizeMap[type] ?? { width: 150, height: 100 };
  const extra: Partial<GraphNode> = {};
  if (type === 'doc') {
    extra.docContent = '';
  }
  return {
    id: crypto.randomUUID(),
    type,
    x,
    y,
    ...size,
    text: '',
    style: baseStyle,
    ...extra,
    ...overrides,
  };
}

export function createEdge(type: EdgeType, from: EdgeEndpoint, to: EdgeEndpoint, overrides?: Partial<GraphEdge>, isDark: boolean = true): GraphEdge {
  return {
    id: crypto.randomUUID(),
    type,
    from,
    to,
    style: getDefaultEdgeStyle(isDark),
    ...overrides,
  };
}

export function createDocument(name: string): GraphDocument {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    nodes: [],
    edges: [],
    viewport: { ...DEFAULT_VIEWPORT },
    createdAt: now,
    updatedAt: now,
  };
}
