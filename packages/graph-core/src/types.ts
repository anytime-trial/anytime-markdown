export type NodeType = 'rect' | 'ellipse' | 'sticky' | 'text' | 'diamond' | 'parallelogram' | 'cylinder' | 'insight' | 'doc' | 'frame' | 'image';
export type EdgeType = 'line' | 'arrow' | 'connector';
export type ToolType = 'select' | 'rect' | 'ellipse' | 'sticky' | 'text' | 'diamond' | 'parallelogram' | 'cylinder' | 'insight' | 'doc' | 'frame' | 'line' | 'arrow' | 'connector' | 'pan';

export interface NodeStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  fontSize: number;
  fontFamily: string;
  borderRadius?: number;
  shadow?: boolean;
  gradientTo?: string;
  gradientDirection?: 'vertical' | 'horizontal' | 'diagonal';
}

export type EndpointShape = 'none' | 'arrow' | 'circle' | 'diamond' | 'bar';
export type RoutingMode = 'orthogonal' | 'bezier';

export interface EdgeStyle {
  stroke: string;
  strokeWidth: number;
  startShape?: EndpointShape;
  endShape?: EndpointShape;
  routing?: RoutingMode;
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
  zIndex?: number;
  /** 画像ノード用: data URL */
  imageData?: string;
  /** 追加の接続ポイント（正規化座標 0-1） */
  extraConnectionPoints?: { x: number; y: number }[];
  /** ハイパーリンクURL */
  url?: string;
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
  /** 直角コネクタの中間ウェイポイント（resolveEdgeConnections で計算） */
  waypoints?: { x: number; y: number }[];
  /** Bezier パスの制御点列（resolveEdgeConnections で計算） */
  bezierPath?: { x: number; y: number }[];
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
  INSIGHT_FILL, INSIGHT_STROKE, INSIGHT_LABEL_COLORS,
  DOC_FILL, DOC_STROKE,
  FRAME_FILL, FRAME_STROKE,
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

export const DEFAULT_INSIGHT_STYLE: NodeStyle = {
  fill: INSIGHT_FILL,
  stroke: INSIGHT_STROKE,
  strokeWidth: 1,
  fontSize: 13,
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

export const DEFAULT_VIEWPORT: Viewport = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
};

export function createNode(type: NodeType, x: number, y: number, overrides?: Partial<GraphNode>): GraphNode {
  const styleMap: Partial<Record<NodeType, NodeStyle>> = {
    sticky: { ...DEFAULT_STICKY_STYLE },
    insight: { ...DEFAULT_INSIGHT_STYLE },
    doc: { ...DEFAULT_DOC_STYLE },
    frame: { ...DEFAULT_FRAME_STYLE },
  };
  const baseStyle = styleMap[type] ?? { ...DEFAULT_NODE_STYLE };
  const sizeMap: Partial<Record<NodeType, { width: number; height: number }>> = {
    text: { width: 150, height: 30 },
    diamond: { width: 120, height: 120 },
    parallelogram: { width: 160, height: 80 },
    cylinder: { width: 100, height: 120 },
    insight: { width: 220, height: 140 },
    doc: { width: 200, height: 120 },
    frame: { width: 400, height: 300 },
    image: { width: 200, height: 150 },
  };
  const size = sizeMap[type] ?? { width: 150, height: 100 };
  const extra: Partial<GraphNode> = {};
  if (type === 'insight') {
    extra.label = 'Insight';
    extra.labelColor = INSIGHT_LABEL_COLORS[0];
  }
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

export function createEdge(type: EdgeType, from: EdgeEndpoint, to: EdgeEndpoint, overrides?: Partial<GraphEdge>): GraphEdge {
  return {
    id: crypto.randomUUID(),
    type,
    from,
    to,
    style: { ...DEFAULT_EDGE_STYLE },
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
