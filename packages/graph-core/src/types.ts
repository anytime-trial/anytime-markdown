export type NodeType = 'rect' | 'ellipse' | 'sticky' | 'text' | 'diamond' | 'parallelogram' | 'cylinder';
export type EdgeType = 'line' | 'arrow' | 'connector';
export type ToolType = 'select' | 'rect' | 'ellipse' | 'sticky' | 'text' | 'diamond' | 'parallelogram' | 'cylinder' | 'line' | 'arrow' | 'connector' | 'pan';

export interface NodeStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  fontSize: number;
  fontFamily: string;
}

export interface EdgeStyle {
  stroke: string;
  strokeWidth: number;
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
  rotation?: number;
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
}

export const DEFAULT_NODE_STYLE: NodeStyle = {
  fill: '#ffffff',
  stroke: '#333333',
  strokeWidth: 2,
  fontSize: 14,
  fontFamily: 'sans-serif',
};

export const DEFAULT_STICKY_STYLE: NodeStyle = {
  fill: '#fff9c4',
  stroke: '#f9a825',
  strokeWidth: 1,
  fontSize: 14,
  fontFamily: 'sans-serif',
};

export const DEFAULT_EDGE_STYLE: EdgeStyle = {
  stroke: '#333333',
  strokeWidth: 2,
};

export const DEFAULT_VIEWPORT: Viewport = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
};

export function createNode(type: NodeType, x: number, y: number, overrides?: Partial<GraphNode>): GraphNode {
  const baseStyle = type === 'sticky' ? { ...DEFAULT_STICKY_STYLE } : { ...DEFAULT_NODE_STYLE };
  const sizeMap: Partial<Record<NodeType, { width: number; height: number }>> = {
    text: { width: 150, height: 30 },
    diamond: { width: 120, height: 120 },
    parallelogram: { width: 160, height: 80 },
    cylinder: { width: 100, height: 120 },
  };
  const size = sizeMap[type] ?? { width: 150, height: 100 };
  return {
    id: crypto.randomUUID(),
    type,
    x,
    y,
    ...size,
    text: '',
    style: baseStyle,
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
