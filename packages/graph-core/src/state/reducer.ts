import {
  GraphDocument, GraphNode, GraphEdge, SelectionState, HistoryEntry,
  Viewport, createDocument,
} from '../types';

export interface GraphState {
  document: GraphDocument;
  selection: SelectionState;
  history: HistoryEntry[];
  historyIndex: number;
}

export type Action =
  | { type: 'SET_DOCUMENT'; doc: GraphDocument }
  | { type: 'ADD_NODE'; node: GraphNode }
  | { type: 'UPDATE_NODE'; id: string; changes: Partial<GraphNode> }
  | { type: 'DELETE_SELECTED' }
  | { type: 'ADD_EDGE'; edge: GraphEdge }
  | { type: 'UPDATE_EDGE'; id: string; changes: Partial<GraphEdge> }
  | { type: 'SET_SELECTION'; selection: SelectionState }
  | { type: 'SET_VIEWPORT'; viewport: Viewport }
  | { type: 'MOVE_NODES'; ids: string[]; dx: number; dy: number }
  | { type: 'RESIZE_NODE'; id: string; x: number; y: number; width: number; height: number }
  | { type: 'GROUP_SELECTED'; groupId: string }
  | { type: 'UNGROUP_SELECTED' }
  | { type: 'PASTE_NODES'; nodes: GraphNode[]; edges: GraphEdge[] }
  | { type: 'ALIGN_NODES'; updates: Array<{ id: string; x?: number; y?: number }> }
  | { type: 'BRING_TO_FRONT'; nodeIds: string[] }
  | { type: 'SEND_TO_BACK'; nodeIds: string[] }
  | { type: 'SELECT_ALL' }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SNAPSHOT' };

export const MAX_HISTORY = 100;

function pushHistory(state: GraphState): GraphState {
  const entry: HistoryEntry = {
    nodes: JSON.parse(JSON.stringify(state.document.nodes)),
    edges: JSON.parse(JSON.stringify(state.document.edges)),
  };
  const history = state.history.slice(0, state.historyIndex + 1);
  history.push(entry);
  if (history.length > MAX_HISTORY) history.shift();
  return { ...state, history, historyIndex: history.length - 1 };
}

export function createInitialState(doc?: GraphDocument): GraphState {
  const d = doc ?? createDocument('Untitled');
  return {
    document: d,
    selection: { nodeIds: [], edgeIds: [] },
    history: [{ nodes: [...d.nodes], edges: [...d.edges] }],
    historyIndex: 0,
  };
}

export function graphReducer(state: GraphState, action: Action): GraphState {
  switch (action.type) {
    case 'SET_DOCUMENT':
      return {
        ...state,
        document: action.doc,
        history: [{ nodes: [...action.doc.nodes], edges: [...action.doc.edges] }],
        historyIndex: 0,
        selection: { nodeIds: [], edgeIds: [] },
      };

    case 'SNAPSHOT':
      return pushHistory(state);

    case 'ADD_NODE': {
      const s = pushHistory(state);
      return {
        ...s,
        document: { ...s.document, nodes: [...s.document.nodes, action.node] },
        selection: { nodeIds: [action.node.id], edgeIds: [] },
      };
    }

    case 'UPDATE_NODE': {
      const s = pushHistory(state);
      return {
        ...s,
        document: {
          ...s.document,
          nodes: s.document.nodes.map(n => n.id === action.id ? { ...n, ...action.changes } : n),
        },
      };
    }

    case 'DELETE_SELECTED': {
      const s = pushHistory(state);
      const { nodeIds, edgeIds } = state.selection;
      return {
        ...s,
        document: {
          ...s.document,
          nodes: s.document.nodes.filter(n => !nodeIds.includes(n.id)),
          edges: s.document.edges.filter(e =>
            !edgeIds.includes(e.id) &&
            !nodeIds.includes(e.from.nodeId ?? '') &&
            !nodeIds.includes(e.to.nodeId ?? ''),
          ),
        },
        selection: { nodeIds: [], edgeIds: [] },
      };
    }

    case 'ADD_EDGE': {
      const s = pushHistory(state);
      return {
        ...s,
        document: { ...s.document, edges: [...s.document.edges, action.edge] },
        selection: { nodeIds: [], edgeIds: [action.edge.id] },
      };
    }

    case 'UPDATE_EDGE': {
      const s = pushHistory(state);
      return {
        ...s,
        document: {
          ...s.document,
          edges: s.document.edges.map(e => e.id === action.id ? { ...e, ...action.changes } : e),
        },
      };
    }

    case 'SET_SELECTION':
      return { ...state, selection: action.selection };

    case 'SET_VIEWPORT':
      return { ...state, document: { ...state.document, viewport: action.viewport } };

    case 'MOVE_NODES': {
      return {
        ...state,
        document: {
          ...state.document,
          nodes: state.document.nodes.map(n =>
            action.ids.includes(n.id) ? { ...n, x: n.x + action.dx, y: n.y + action.dy } : n,
          ),
        },
      };
    }

    case 'RESIZE_NODE': {
      return {
        ...state,
        document: {
          ...state.document,
          nodes: state.document.nodes.map(n =>
            n.id === action.id ? { ...n, x: action.x, y: action.y, width: action.width, height: action.height } : n,
          ),
        },
      };
    }

    case 'GROUP_SELECTED': {
      const s = pushHistory(state);
      return {
        ...s,
        document: {
          ...s.document,
          nodes: s.document.nodes.map(n =>
            state.selection.nodeIds.includes(n.id) ? { ...n, groupId: action.groupId } : n,
          ),
        },
      };
    }

    case 'UNGROUP_SELECTED': {
      const s = pushHistory(state);
      const groupIds = new Set(
        s.document.nodes.filter(n => state.selection.nodeIds.includes(n.id) && n.groupId).map(n => n.groupId),
      );
      return {
        ...s,
        document: {
          ...s.document,
          nodes: s.document.nodes.map(n =>
            n.groupId && groupIds.has(n.groupId) ? { ...n, groupId: undefined } : n,
          ),
        },
      };
    }

    case 'PASTE_NODES': {
      const s = pushHistory(state);
      return {
        ...s,
        document: {
          ...s.document,
          nodes: [...s.document.nodes, ...action.nodes],
          edges: [...s.document.edges, ...action.edges],
        },
        selection: { nodeIds: action.nodes.map(n => n.id), edgeIds: [] },
      };
    }

    case 'ALIGN_NODES': {
      const s = pushHistory(state);
      return {
        ...s,
        document: {
          ...s.document,
          nodes: s.document.nodes.map(n => {
            const u = action.updates.find(u => u.id === n.id);
            if (!u) return n;
            return { ...n, ...(u.x !== undefined ? { x: u.x } : {}), ...(u.y !== undefined ? { y: u.y } : {}) };
          }),
        },
      };
    }

    case 'BRING_TO_FRONT': {
      const s = pushHistory(state);
      const targetSet = new Set(action.nodeIds);
      const rest = s.document.nodes.filter(n => !targetSet.has(n.id));
      const targets = s.document.nodes.filter(n => targetSet.has(n.id));
      return {
        ...s,
        document: { ...s.document, nodes: [...rest, ...targets] },
      };
    }

    case 'SEND_TO_BACK': {
      const s = pushHistory(state);
      const targetSet = new Set(action.nodeIds);
      const rest = s.document.nodes.filter(n => !targetSet.has(n.id));
      const targets = s.document.nodes.filter(n => targetSet.has(n.id));
      return {
        ...s,
        document: { ...s.document, nodes: [...targets, ...rest] },
      };
    }

    case 'SELECT_ALL':
      return {
        ...state,
        selection: { nodeIds: state.document.nodes.map(n => n.id), edgeIds: [] },
      };

    case 'UNDO': {
      if (state.historyIndex <= 0) return state;
      const idx = state.historyIndex - 1;
      const entry = state.history[idx];
      return {
        ...state,
        historyIndex: idx,
        document: {
          ...state.document,
          nodes: JSON.parse(JSON.stringify(entry.nodes)),
          edges: JSON.parse(JSON.stringify(entry.edges)),
        },
        selection: { nodeIds: [], edgeIds: [] },
      };
    }

    case 'REDO': {
      if (state.historyIndex >= state.history.length - 1) return state;
      const idx = state.historyIndex + 1;
      const entry = state.history[idx];
      return {
        ...state,
        historyIndex: idx,
        document: {
          ...state.document,
          nodes: JSON.parse(JSON.stringify(entry.nodes)),
          edges: JSON.parse(JSON.stringify(entry.edges)),
        },
        selection: { nodeIds: [], edgeIds: [] },
      };
    }

    default:
      return state;
  }
}
