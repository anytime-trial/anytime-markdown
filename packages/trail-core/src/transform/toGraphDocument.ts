import type { TrailGraph, TrailNode, TrailNodeType } from '../model/types';

// ---------------------------------------------------------------------------
// graph-core 互換の型をローカルに定義（import type のみで依存しない）
// ---------------------------------------------------------------------------

type NodeType = 'rect' | 'ellipse' | 'sticky' | 'text' | 'diamond' | 'parallelogram' | 'cylinder' | 'doc' | 'frame' | 'image';
type EdgeType = 'line' | 'arrow' | 'connector';

interface NodeStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  fontSize: number;
  fontFamily: string;
}

interface EdgeStyle {
  stroke: string;
  strokeWidth: number;
}

interface EdgeEndpoint {
  nodeId?: string;
  x: number;
  y: number;
}

interface GraphNode {
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
  metadata?: Record<string, string | number>;
}

interface GraphEdge {
  id: string;
  type: EdgeType;
  from: EdgeEndpoint;
  to: EdgeEndpoint;
  style: EdgeStyle;
  label?: string;
  weight?: number;
}

interface Viewport {
  offsetX: number;
  offsetY: number;
  scale: number;
}

interface GraphDocument {
  id: string;
  name: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  viewport: Viewport;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Node type mapping
// ---------------------------------------------------------------------------

interface NodeMapping {
  readonly type: NodeType;
  readonly width: number;
  readonly height: number;
}

const NODE_TYPE_MAP: Readonly<Record<TrailNodeType, NodeMapping>> = {
  file:      { type: 'doc',           width: 200, height: 80  },
  class:     { type: 'rect',          width: 150, height: 60  },
  interface: { type: 'rect',          width: 150, height: 60  },
  function:  { type: 'ellipse',       width: 120, height: 60  },
  variable:  { type: 'diamond',       width: 100, height: 100 },
  type:      { type: 'parallelogram', width: 150, height: 60  },
  enum:      { type: 'parallelogram', width: 150, height: 60  },
  namespace: { type: 'frame',         width: 300, height: 200 },
};

// ---------------------------------------------------------------------------
// Grid layout constants
// ---------------------------------------------------------------------------

const COLS = 5;
const GAP_X = 250;
const GAP_Y = 150;

// ---------------------------------------------------------------------------
// Default styles
// ---------------------------------------------------------------------------

const DEFAULT_NODE_STYLE: Readonly<NodeStyle> = {
  fill: '#ffffff',
  stroke: '#333333',
  strokeWidth: 1,
  fontSize: 14,
  fontFamily: 'sans-serif',
};

const DEFAULT_EDGE_STYLE: Readonly<EdgeStyle> = {
  stroke: '#666666',
  strokeWidth: 1,
};

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

function convertNode(node: TrailNode, index: number): GraphNode {
  const mapping = NODE_TYPE_MAP[node.type];
  return {
    id: `node-${index}`,
    type: mapping.type,
    x: (index % COLS) * GAP_X,
    y: Math.floor(index / COLS) * GAP_Y,
    width: mapping.width,
    height: mapping.height,
    text: node.label,
    style: { ...DEFAULT_NODE_STYLE },
    metadata: {
      trailId: node.id,
      trailType: node.type,
      filePath: node.filePath,
      line: node.line,
    },
  };
}

/**
 * TrailGraph を graph-core 互換の GraphDocument に変換する。
 *
 * @param graph  - 解析済みの TrailGraph
 * @param name   - ドキュメント名
 * @returns graph-core 互換の GraphDocument
 */
export function toGraphDocument(graph: TrailGraph, name: string): GraphDocument {
  const now = Date.now();

  // trail node id → GraphNode id のマッピング
  const idMap = new Map<string, string>();
  const nodes = graph.nodes.map((node, index) => {
    const gNode = convertNode(node, index);
    idMap.set(node.id, gNode.id);
    return gNode;
  });

  const edges: GraphEdge[] = graph.edges.map((edge, index) => ({
    id: `edge-${index}`,
    type: 'arrow' as const,
    from: { nodeId: idMap.get(edge.source), x: 0, y: 0 },
    to:   { nodeId: idMap.get(edge.target), x: 0, y: 0 },
    style: { ...DEFAULT_EDGE_STYLE },
    label: edge.type,
  }));

  return {
    id: `trail-${name}`,
    name,
    nodes,
    edges,
    viewport: { offsetX: 0, offsetY: 0, scale: 1 },
    createdAt: now,
    updatedAt: now,
  };
}
