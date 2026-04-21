import {
  GraphDocument, GraphNode, GraphEdge, GraphGroup, SelectionState, HistoryEntry,
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
  /** ドラッグ中に毎フレーム発行。履歴は記録しない。ドラッグ完了時に SNAPSHOT を発行すること */
  | { type: 'MOVE_NODES'; ids: string[]; dx: number; dy: number }
  /** リサイズ中に毎フレーム発行。履歴は記録しない。リサイズ完了時に SNAPSHOT を発行すること */
  | { type: 'RESIZE_NODE'; id: string; x: number; y: number; width: number; height: number }
  /** 複数ノードの位置を一括更新。ドラッグ中に毎フレーム発行。履歴は記録しない */
  | { type: 'SET_NODE_POSITIONS'; updates: Array<{ id: string; x: number; y: number }> }
  | { type: 'CREATE_GROUP'; memberIds: string[]; label?: string }
  | { type: 'DELETE_GROUP'; id: string }
  | { type: 'UPDATE_GROUP_LABEL'; id: string; label: string }
  | { type: 'ADD_TO_GROUP'; groupId: string; nodeId: string }
  | { type: 'REMOVE_FROM_GROUP'; groupId: string; nodeId: string }
  | { type: 'PASTE_NODES'; nodes: GraphNode[]; edges: GraphEdge[] }
  | { type: 'ALIGN_NODES'; updates: Array<{ id: string; x?: number; y?: number }> }
  | { type: 'BRING_TO_FRONT'; nodeIds: string[] }
  | { type: 'SEND_TO_BACK'; nodeIds: string[] }
  | { type: 'SELECT_ALL' }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SNAPSHOT' };

export const MAX_HISTORY = 50;

function pushHistory(state: GraphState): GraphState {
  const entry: HistoryEntry = {
    nodes: structuredClone(state.document.nodes),
    edges: structuredClone(state.document.edges),
    groups: structuredClone(state.document.groups ?? []),
    selection: { ...state.selection },
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
    history: [{ nodes: structuredClone(d.nodes), edges: structuredClone(d.edges), selection: { nodeIds: [], edgeIds: [] } }],
    historyIndex: 0,
  };
}

export function graphReducer(state: GraphState, action: Action): GraphState {
  switch (action.type) {
    case 'SET_DOCUMENT':
      return {
        ...state,
        document: action.doc,
        history: [{ nodes: structuredClone(action.doc.nodes), edges: structuredClone(action.doc.edges), selection: { nodeIds: [], edgeIds: [] } }],
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
      // Filter out locked nodes — they must not be deleted
      const deletableNodeIds = nodeIds.filter(id => {
        const node = state.document.nodes.find(n => n.id === id);
        return node && !node.locked;
      });
      return {
        ...s,
        document: {
          ...s.document,
          nodes: s.document.nodes.filter(n => !deletableNodeIds.includes(n.id)),
          edges: s.document.edges.filter(e =>
            !edgeIds.includes(e.id) &&
            !deletableNodeIds.includes(e.from.nodeId ?? '') &&
            !deletableNodeIds.includes(e.to.nodeId ?? ''),
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

    case 'SET_NODE_POSITIONS': {
      const map = new Map(action.updates.map(u => [u.id, u]));
      return {
        ...state,
        document: {
          ...state.document,
          nodes: state.document.nodes.map(n => {
            const u = map.get(n.id);
            return u ? { ...n, x: u.x, y: u.y } : n;
          }),
        },
      };
    }

    case 'CREATE_GROUP': {
      if (action.memberIds.length < 2) return state;
      const s = pushHistory(state);
      const newGroup: GraphGroup = {
        id: crypto.randomUUID(),
        memberIds: [...action.memberIds],
        label: action.label,
      };
      return {
        ...s,
        document: {
          ...s.document,
          groups: [...(s.document.groups ?? []), newGroup],
        },
      };
    }

    case 'DELETE_GROUP': {
      const s = pushHistory(state);
      return {
        ...s,
        document: {
          ...s.document,
          groups: (s.document.groups ?? []).filter(g => g.id !== action.id),
        },
      };
    }

    case 'UPDATE_GROUP_LABEL': {
      const s = pushHistory(state);
      return {
        ...s,
        document: {
          ...s.document,
          groups: (s.document.groups ?? []).map(g =>
            g.id === action.id ? { ...g, label: action.label } : g,
          ),
        },
      };
    }

    case 'ADD_TO_GROUP': {
      const s = pushHistory(state);
      return {
        ...s,
        document: {
          ...s.document,
          groups: (s.document.groups ?? []).map(g =>
            g.id === action.groupId && !g.memberIds.includes(action.nodeId)
              ? { ...g, memberIds: [...g.memberIds, action.nodeId] }
              : g,
          ),
        },
      };
    }

    case 'REMOVE_FROM_GROUP': {
      const s = pushHistory(state);
      const groups = (s.document.groups ?? []).reduce<GraphGroup[]>((acc, g) => {
        if (g.id !== action.groupId) { acc.push(g); return acc; }
        const memberIds = g.memberIds.filter(id => id !== action.nodeId);
        if (memberIds.length >= 2) acc.push({ ...g, memberIds });
        return acc;
      }, []);
      return {
        ...s,
        document: { ...s.document, groups },
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
            return { ...n, ...(u.x === undefined ? {} : { x: u.x }), ...(u.y === undefined ? {} : { y: u.y }) };
          }),
        },
      };
    }

    case 'BRING_TO_FRONT': {
      const s = pushHistory(state);
      const targetSet = new Set(action.nodeIds);
      const maxZ = s.document.nodes.reduce((m, n) => Math.max(m, n.zIndex ?? 0), 0);
      return {
        ...s,
        document: {
          ...s.document,
          nodes: s.document.nodes.map(n =>
            targetSet.has(n.id) ? { ...n, zIndex: maxZ + 1 } : n,
          ),
        },
      };
    }

    case 'SEND_TO_BACK': {
      const s = pushHistory(state);
      const targetSet = new Set(action.nodeIds);
      const minZ = s.document.nodes.reduce((m, n) => Math.min(m, n.zIndex ?? 0), 0);
      return {
        ...s,
        document: {
          ...s.document,
          nodes: s.document.nodes.map(n =>
            targetSet.has(n.id) ? { ...n, zIndex: minZ - 1 } : n,
          ),
        },
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
          nodes: structuredClone(entry.nodes),
          edges: structuredClone(entry.edges),
          groups: structuredClone(entry.groups ?? []),
        },
        selection: entry.selection ?? { nodeIds: [], edgeIds: [] },
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
          nodes: structuredClone(entry.nodes),
          edges: structuredClone(entry.edges),
          groups: structuredClone(entry.groups ?? []),
        },
        selection: entry.selection ?? { nodeIds: [], edgeIds: [] },
      };
    }

    default:
      return state;
  }
}
