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
  | { type: 'GROUP_SELECTED'; groupId?: string }
  | { type: 'UNGROUP_SELECTED' }
  | { type: 'SELECT_ALL' }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SNAPSHOT' };

export const MAX_HISTORY = 50;

/**
 * 不変条件: history[historyIndex] は常に「現在の確定済み状態」を保持する。
 *
 * 各 mutation アクションは withHistory(before, after) を呼び出し、
 * after 状態を history[historyIndex+1] に保存して historyIndex を進める。
 * UNDO/REDO は history[historyIndex ∓ 1] を復元するだけでよい。
 */
function withHistory(before: GraphState, after: GraphState): GraphState {
  const entry: HistoryEntry = {
    nodes: structuredClone(after.document.nodes),
    edges: structuredClone(after.document.edges),
    groups: structuredClone(after.document.groups ?? []),
    selection: { ...after.selection },
  };
  const history = before.history.slice(0, before.historyIndex + 1);
  history.push(entry);
  if (history.length > MAX_HISTORY) history.shift();
  return { ...after, history, historyIndex: history.length - 1 };
}

function makeInitialEntry(doc: GraphDocument): HistoryEntry {
  return {
    nodes: structuredClone(doc.nodes),
    edges: structuredClone(doc.edges),
    groups: structuredClone(doc.groups ?? []),
    selection: { nodeIds: [], edgeIds: [] },
  };
}

export function createInitialState(doc?: GraphDocument): GraphState {
  const d = doc ?? createDocument('Untitled');
  return {
    document: d,
    selection: { nodeIds: [], edgeIds: [] },
    history: [makeInitialEntry(d)],
    historyIndex: 0,
  };
}

export function graphReducer(state: GraphState, action: Action): GraphState {
  switch (action.type) {
    case 'SET_DOCUMENT':
      return {
        ...state,
        document: action.doc,
        history: [makeInitialEntry(action.doc)],
        historyIndex: 0,
        selection: { nodeIds: [], edgeIds: [] },
      };

    case 'SNAPSHOT': {
      // ドラッグ完了時に呼ばれる。現在の状態（MOVE_NODES 適用済み）を history に確定する。
      return withHistory(state, state);
    }

    case 'ADD_NODE': {
      const after = {
        ...state,
        document: { ...state.document, nodes: [...state.document.nodes, action.node] },
        selection: { nodeIds: [action.node.id], edgeIds: [] },
      };
      return withHistory(state, after);
    }

    case 'UPDATE_NODE': {
      const after = {
        ...state,
        document: {
          ...state.document,
          nodes: state.document.nodes.map(n => n.id === action.id ? { ...n, ...action.changes } : n),
        },
      };
      return withHistory(state, after);
    }

    case 'DELETE_SELECTED': {
      const { nodeIds, edgeIds } = state.selection;
      const deletableNodeIds = nodeIds.filter(id => {
        const node = state.document.nodes.find(n => n.id === id);
        return node && !node.locked;
      });
      const after = {
        ...state,
        document: {
          ...state.document,
          nodes: state.document.nodes.filter(n => !deletableNodeIds.includes(n.id)),
          edges: state.document.edges.filter(e =>
            !edgeIds.includes(e.id) &&
            !deletableNodeIds.includes(e.from.nodeId ?? '') &&
            !deletableNodeIds.includes(e.to.nodeId ?? ''),
          ),
        },
        selection: { nodeIds: [], edgeIds: [] },
      };
      return withHistory(state, after);
    }

    case 'ADD_EDGE': {
      const after = {
        ...state,
        document: { ...state.document, edges: [...state.document.edges, action.edge] },
        selection: { nodeIds: [], edgeIds: [action.edge.id] },
      };
      return withHistory(state, after);
    }

    case 'UPDATE_EDGE': {
      const after = {
        ...state,
        document: {
          ...state.document,
          edges: state.document.edges.map(e => e.id === action.id ? { ...e, ...action.changes } : e),
        },
      };
      return withHistory(state, after);
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

    case 'GROUP_SELECTED': {
      const memberIds = state.selection.nodeIds;
      if (memberIds.length < 2) return state;
      const newGroup: GraphGroup = {
        id: action.groupId ?? crypto.randomUUID(),
        memberIds: [...memberIds],
      };
      const after = {
        ...state,
        document: {
          ...state.document,
          groups: [...(state.document.groups ?? []), newGroup],
        },
      };
      return withHistory(state, after);
    }

    case 'UNGROUP_SELECTED': {
      const selectedIds = new Set(state.selection.nodeIds);
      const after = {
        ...state,
        document: {
          ...state.document,
          groups: (state.document.groups ?? []).filter(
            g => !g.memberIds.some(id => selectedIds.has(id)),
          ),
        },
      };
      return withHistory(state, after);
    }

    case 'CREATE_GROUP': {
      if (action.memberIds.length < 2) return state;
      const newGroup: GraphGroup = {
        id: crypto.randomUUID(),
        memberIds: [...action.memberIds],
        label: action.label,
      };
      const after = {
        ...state,
        document: {
          ...state.document,
          groups: [...(state.document.groups ?? []), newGroup],
        },
      };
      return withHistory(state, after);
    }

    case 'DELETE_GROUP': {
      const after = {
        ...state,
        document: {
          ...state.document,
          groups: (state.document.groups ?? []).filter(g => g.id !== action.id),
        },
      };
      return withHistory(state, after);
    }

    case 'UPDATE_GROUP_LABEL': {
      const after = {
        ...state,
        document: {
          ...state.document,
          groups: (state.document.groups ?? []).map(g =>
            g.id === action.id ? { ...g, label: action.label } : g,
          ),
        },
      };
      return withHistory(state, after);
    }

    case 'ADD_TO_GROUP': {
      const after = {
        ...state,
        document: {
          ...state.document,
          groups: (state.document.groups ?? []).map(g =>
            g.id === action.groupId && !g.memberIds.includes(action.nodeId)
              ? { ...g, memberIds: [...g.memberIds, action.nodeId] }
              : g,
          ),
        },
      };
      return withHistory(state, after);
    }

    case 'REMOVE_FROM_GROUP': {
      const groups = (state.document.groups ?? []).reduce<GraphGroup[]>((acc, g) => {
        if (g.id !== action.groupId) { acc.push(g); return acc; }
        const memberIds = g.memberIds.filter(id => id !== action.nodeId);
        if (memberIds.length >= 2) acc.push({ ...g, memberIds });
        return acc;
      }, []);
      const after = { ...state, document: { ...state.document, groups } };
      return withHistory(state, after);
    }

    case 'PASTE_NODES': {
      const after = {
        ...state,
        document: {
          ...state.document,
          nodes: [...state.document.nodes, ...action.nodes],
          edges: [...state.document.edges, ...action.edges],
        },
        selection: { nodeIds: action.nodes.map(n => n.id), edgeIds: [] },
      };
      return withHistory(state, after);
    }

    case 'ALIGN_NODES': {
      const after = {
        ...state,
        document: {
          ...state.document,
          nodes: state.document.nodes.map(n => {
            const u = action.updates.find(u => u.id === n.id);
            if (!u) return n;
            return { ...n, ...(u.x === undefined ? {} : { x: u.x }), ...(u.y === undefined ? {} : { y: u.y }) };
          }),
        },
      };
      return withHistory(state, after);
    }

    case 'BRING_TO_FRONT': {
      const targetSet = new Set(action.nodeIds);
      const maxZ = state.document.nodes.reduce((m, n) => Math.max(m, n.zIndex ?? 0), 0);
      const after = {
        ...state,
        document: {
          ...state.document,
          nodes: state.document.nodes.map(n =>
            targetSet.has(n.id) ? { ...n, zIndex: maxZ + 1 } : n,
          ),
        },
      };
      return withHistory(state, after);
    }

    case 'SEND_TO_BACK': {
      const targetSet = new Set(action.nodeIds);
      const minZ = state.document.nodes.reduce((m, n) => Math.min(m, n.zIndex ?? 0), 0);
      const after = {
        ...state,
        document: {
          ...state.document,
          nodes: state.document.nodes.map(n =>
            targetSet.has(n.id) ? { ...n, zIndex: minZ - 1 } : n,
          ),
        },
      };
      return withHistory(state, after);
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
