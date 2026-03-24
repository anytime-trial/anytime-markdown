// Re-export all types from graph-core
export {
  type NodeType, type EdgeType, type ToolType,
  type NodeStyle, type EdgeStyle,
  type GraphNode, type EdgeEndpoint, type GraphEdge,
  type Viewport, type GraphDocument,
  type SelectionState, type HistoryEntry,
  DEFAULT_NODE_STYLE, DEFAULT_STICKY_STYLE, DEFAULT_EDGE_STYLE, DEFAULT_VIEWPORT,
  createNode, createEdge, createDocument,
} from '@anytime-markdown/graph-core';
