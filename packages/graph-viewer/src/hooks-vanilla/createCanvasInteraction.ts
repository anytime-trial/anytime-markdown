import { computeVisibilityPath } from '@anytime-markdown/graph-core/engine';
import { physics } from '@anytime-markdown/graph-core/engine';

import {
  bestSides, computeOrthogonalPath, getConnectionPoints, nearestBorderPoint, resolveConnectorEndpoints,
  snapToGrid, hitTest, hitTestEdge, computeSmartGuides,
  pan as panViewport, screenToWorld, zoom as zoomViewport,
} from '@anytime-markdown/graph-core/engine';
import type { ResizeHandle, GuideLine } from '@anytime-markdown/graph-core/engine';
import { createEdge, createNode, GraphEdge, GraphNode, SelectionState, ToolType, Viewport } from '../types';
import type { NodeType } from '../types';
import type { Action } from '@anytime-markdown/graph-core/state';

// ─── 型定義 ────────────────────────────────────────────────────────────────

interface DragState {
  type: 'none' | 'pan' | 'move' | 'resize' | 'create-shape' | 'select-rect' | 'create-edge' | 'move-edge-segment' | 'move-waypoint';
  startWorldX: number;
  startWorldY: number;
  startScreenX: number;
  startScreenY: number;
  handle?: ResizeHandle;
  nodeId?: string;
  edgeId?: string;
  segmentDirection?: 'horizontal' | 'vertical';
  segmentIndex?: number;
  endpointEnd?: 'from' | 'to';
  fromConnectionPoint?: boolean;
  initialMidpoint?: number;
  initialWaypoints?: { x: number; y: number }[];
  waypointIndex?: number;
  initialNodes?: Map<string, { x: number; y: number; width: number; height: number }>;
}

export interface DragPreview {
  type: 'none' | 'edge' | 'shape' | 'select-rect';
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  shapeType?: 'rect' | 'ellipse' | 'sticky' | 'text' | 'diamond' | 'parallelogram' | 'cylinder' | 'doc' | 'frame';
  edgeType?: 'line' | 'connector';
  /** ドラッグ中にスナップしているノードID */
  snapNodeId?: string;
  /** スマートガイドライン */
  guides?: GuideLine[];
}

/**
 * factory に渡す依存オブジェクト。
 * 時間変化する値（tool, nodes, edges, viewport, selection, showGrid, isDark, collisionEnabled）は
 * getter 経由にして毎回最新を取得する。
 */
export interface CanvasInteractionDeps {
  /** 操作対象の canvas 要素 */
  canvas: HTMLCanvasElement;

  // ── 時間変化する値の getter ──
  getTool(): ToolType;
  getNodes(): readonly GraphNode[];
  getEdges(): readonly GraphEdge[];
  getViewport(): Viewport;
  getSelection(): SelectionState;
  getShowGrid(): boolean;
  getIsDark(): boolean;
  getCollisionEnabled(): boolean;

  // ── コールバック ──
  dispatch: (action: Action) => void;
  onTextEdit: (nodeId: string) => void;
  onToolChange: (tool: ToolType) => void;
  onLiveMessage?: (message: string) => void;

  // ── Physics エンジン（任意） ──
  physics?: physics.PhysicsEngine | null;
}

/**
 * createCanvasInteraction が返すハンドル。
 * canvas・window のリスナは factory 内で自動配線されるため、
 * host は destroy() の呼び出しとドラッグ状態の読み取りのみ行う。
 */
export interface CanvasInteractionHandle {
  /** リスナを全て解除しリソースを開放する */
  destroy(): void;

  // ── 現在の状態（外部から参照可） ──
  drag: DragState;
  preview: DragPreview;
  clipboard: { nodes: GraphNode[]; edges: GraphEdge[] } | null;
  hoverNodeId: string | undefined;
  mouseWorld: { x: number; y: number };
  cursor: string;
  velocity: { vx: number; vy: number };

  // ── 公開ハンドラ（host が必要な場合に直接呼べる） ──
  handleKeyDown(e: KeyboardEvent): void;
  copySelected(): void;
  pasteFromClipboard(): Promise<void>;
}

// ─── 定数 ────────────────────────────────────────────────────────────────

const EMPTY_PREVIEW: DragPreview = { type: 'none', fromX: 0, fromY: 0, toX: 0, toY: 0 };
const EMPTY_DRAG: DragState = { type: 'none', startWorldX: 0, startWorldY: 0, startScreenX: 0, startScreenY: 0 };

// ─── resolveEdgesWithWaypoints ────────────────────────────────────────────

function resolveEdgesWithWaypoints(
  edges: readonly GraphEdge[],
  nodes: readonly GraphNode[],
): (GraphEdge & { waypoints?: { x: number; y: number }[] })[] {
  return (edges as GraphEdge[]).map(e => {
    if (e.type === 'connector' && e.from.nodeId && e.to.nodeId) {
      const fromNode = nodes.find(n => n.id === e.from.nodeId);
      const toNode = nodes.find(n => n.id === e.to.nodeId);
      if (fromNode && toNode) {
        if ((e.style.routing) === 'straight') {
          const pts = resolveConnectorEndpoints(e, nodes as GraphNode[]);
          return { ...e, from: { ...e.from, ...pts.from }, to: { ...e.to, ...pts.to } };
        }
        if (e.manualWaypoints?.length) {
          const pts = resolveConnectorEndpoints(e, nodes as GraphNode[]);
          return { ...e, waypoints: [pts.from, ...e.manualWaypoints, pts.to] };
        }
        if (e.manualMidpoint !== undefined) {
          const waypoints = computeOrthogonalPath(fromNode, toNode, 20, e.manualMidpoint);
          return { ...e, waypoints };
        }
        const sides = bestSides(fromNode, toNode);
        const fromPts = getConnectionPoints(fromNode);
        const toPts = getConnectionPoints(toNode);
        const fromPt = fromPts.find(p => p.side === sides.fromSide) ?? fromPts[0];
        const toPt = toPts.find(p => p.side === sides.toSide) ?? toPts[0];
        const waypoints = computeVisibilityPath(fromPt, sides.fromSide, toPt, sides.toSide, []);
        return { ...e, waypoints };
      }
    }
    return e;
  });
}

// ─── handleMouseDown ヘルパー ─────────────────────────────────────────────

function handleSelectHit(
  hit: ReturnType<typeof hitTest>,
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  selection: SelectionState,
  world: { x: number; y: number },
  sx: number, sy: number,
  e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  viewport: Viewport,
  dispatch: (action: Action) => void,
  physicsEngine: physics.PhysicsEngine | null | undefined,
): DragState | null {
  if (hit.type === 'frame-collapse' && hit.id) {
    return handleFrameCollapseHit(hit, nodes, dispatch);
  }
  if (hit.type === 'edge-endpoint' && hit.id && hit.endpointEnd) {
    return handleEdgeEndpointHit(hit, edges, sx, sy, dispatch);
  }
  if (hit.type === 'connection-point' && hit.id) {
    return handleConnectionPointHit(hit, world, sx, sy);
  }
  if (hit.type === 'resize-handle' && hit.id && hit.handle) {
    return handleResizeHit(hit, nodes, world, sx, sy, dispatch);
  }
  if ((e.ctrlKey || e.metaKey) && hit.type === 'node' && hit.id) {
    const node = nodes.find(n => n.id === hit.id);
    if (node?.url) {
      window.open(node.url, '_blank', 'noopener,noreferrer');
      return null;
    }
  }
  if (hit.type === 'node' && hit.id) {
    return handleNodeHit(hit, nodes, selection, world, sx, sy, e, dispatch, physicsEngine);
  }
  if (hit.type === 'waypoint-handle' && hit.id && hit.waypointIndex !== undefined) {
    return handleWaypointHit(hit, edges, world, sx, sy, dispatch);
  }
  if (hit.type === 'edge-segment' && hit.id && hit.segmentDirection) {
    return handleEdgeSegmentHit(hit, edges, world, sx, sy, dispatch);
  }
  if (hit.type === 'edge' && hit.id) {
    handleEdgeHit(hit, edges, nodes, selection, world, viewport, dispatch);
    return null;
  }
  if (!e.shiftKey) {
    dispatch({ type: 'SET_SELECTION', selection: { nodeIds: [], edgeIds: [] } });
  }
  return { type: 'select-rect', startWorldX: world.x, startWorldY: world.y, startScreenX: sx, startScreenY: sy };
}

function handleFrameCollapseHit(
  hit: ReturnType<typeof hitTest>,
  nodes: readonly GraphNode[],
  dispatch: (action: Action) => void,
): null {
  const frameNode = nodes.find(n => n.id === hit.id);
  if (frameNode) {
    dispatch({ type: 'UPDATE_NODE', id: hit.id!, changes: { collapsed: !(frameNode.collapsed ?? false) } });
  }
  return null;
}

function handleEdgeEndpointHit(
  hit: ReturnType<typeof hitTest>,
  edges: readonly GraphEdge[],
  sx: number, sy: number,
  dispatch: (action: Action) => void,
): DragState | null {
  const edge = edges.find(ed => ed.id === hit.id);
  if (!edge) return null;
  const endpoint = hit.endpointEnd === 'from' ? edge.from : edge.to;
  dispatch({ type: 'SNAPSHOT' });
  return {
    type: 'create-edge', startWorldX: endpoint.x, startWorldY: endpoint.y,
    startScreenX: sx, startScreenY: sy,
    edgeId: hit.id, endpointEnd: hit.endpointEnd,
    nodeId: hit.endpointEnd === 'from' ? edge.to.nodeId : edge.from.nodeId,
  };
}

function handleConnectionPointHit(
  hit: ReturnType<typeof hitTest>,
  world: { x: number; y: number },
  sx: number, sy: number,
): DragState {
  const cpX = hit.connectionX ?? world.x;
  const cpY = hit.connectionY ?? world.y;
  return {
    type: 'create-edge', startWorldX: cpX, startWorldY: cpY,
    startScreenX: sx, startScreenY: sy, nodeId: hit.id,
    fromConnectionPoint: true,
  };
}

function handleResizeHit(
  hit: ReturnType<typeof hitTest>,
  nodes: readonly GraphNode[],
  world: { x: number; y: number },
  sx: number, sy: number,
  dispatch: (action: Action) => void,
): DragState | null {
  const node = nodes.find(n => n.id === hit.id);
  if (!node || node.locked) return null;
  dispatch({ type: 'SNAPSHOT' });
  return {
    type: 'resize', startWorldX: world.x, startWorldY: world.y,
    startScreenX: sx, startScreenY: sy, handle: hit.handle, nodeId: hit.id,
    initialNodes: new Map([[node.id, { x: node.x, y: node.y, width: node.width, height: node.height }]]),
  };
}

function handleNodeHit(
  hit: ReturnType<typeof hitTest>,
  nodes: readonly GraphNode[],
  selection: SelectionState,
  world: { x: number; y: number },
  sx: number, sy: number,
  e: { shiftKey: boolean },
  dispatch: (action: Action) => void,
  physicsEngine: physics.PhysicsEngine | null | undefined,
): DragState | null {
  const isSelected = selection.nodeIds.includes(hit.id!);
  let selectedIds = computeNodeSelection(hit.id!, isSelected, selection, nodes, e.shiftKey);
  selectedIds = expandFrameSelection(selectedIds, nodes);
  dispatch({ type: 'SET_SELECTION', selection: { nodeIds: selectedIds, edgeIds: [] } });
  const hitNode = nodes.find(n => n.id === hit.id);
  if (hitNode?.locked) return null;
  const initialNodes = new Map<string, { x: number; y: number; width: number; height: number }>();
  for (const id of selectedIds) {
    const n = nodes.find(nd => nd.id === id);
    if (n && !n.locked) initialNodes.set(id, { x: n.x, y: n.y, width: n.width, height: n.height });
  }
  if (physicsEngine) {
    physicsEngine.syncFromNodes(nodes as GraphNode[]);
  }
  dispatch({ type: 'SNAPSHOT' });
  return {
    type: 'move', startWorldX: world.x, startWorldY: world.y,
    startScreenX: sx, startScreenY: sy, initialNodes,
  };
}

function computeNodeSelection(
  hitId: string,
  isSelected: boolean,
  selection: SelectionState,
  nodes: readonly GraphNode[],
  shiftKey: boolean,
): string[] {
  let selectedIds: string[];
  if (shiftKey) {
    selectedIds = isSelected
      ? selection.nodeIds.filter(id => id !== hitId)
      : [...selection.nodeIds, hitId];
  } else {
    selectedIds = isSelected ? selection.nodeIds : [hitId];
  }
  const groupIds = new Set(nodes.filter(n => selectedIds.includes(n.id) && n.groupId).map(n => n.groupId));
  if (groupIds.size > 0) {
    for (const n of nodes) {
      if (n.groupId && groupIds.has(n.groupId)) selectedIds.push(n.id);
    }
    selectedIds = [...new Set(selectedIds)];
  }
  return selectedIds;
}

function expandFrameSelection(selectedIds: string[], nodes: readonly GraphNode[]): string[] {
  const frameNodes = nodes.filter(n => selectedIds.includes(n.id) && n.type === 'frame');
  if (frameNodes.length === 0) return selectedIds;
  const expanded = [...selectedIds];
  for (const frame of frameNodes) {
    for (const n of nodes) {
      if (n.id !== frame.id && n.type !== 'frame' &&
          n.x >= frame.x && n.y >= frame.y &&
          n.x + n.width <= frame.x + frame.width &&
          n.y + n.height <= frame.y + frame.height) {
        expanded.push(n.id);
      }
    }
  }
  return [...new Set(expanded)];
}

function handleWaypointHit(
  hit: ReturnType<typeof hitTest>,
  edges: readonly GraphEdge[],
  world: { x: number; y: number },
  sx: number, sy: number,
  dispatch: (action: Action) => void,
): DragState {
  const edge = edges.find(ed => ed.id === hit.id);
  dispatch({ type: 'SET_SELECTION', selection: { nodeIds: [], edgeIds: [hit.id!] } });
  dispatch({ type: 'SNAPSHOT' });
  return {
    type: 'move-waypoint', startWorldX: world.x, startWorldY: world.y,
    startScreenX: sx, startScreenY: sy,
    edgeId: hit.id, waypointIndex: hit.waypointIndex,
    initialWaypoints: edge?.manualWaypoints ? [...edge.manualWaypoints.map(w => ({ ...w }))] : [],
  };
}

function handleEdgeSegmentHit(
  hit: ReturnType<typeof hitTest>,
  edges: readonly GraphEdge[],
  world: { x: number; y: number },
  sx: number, sy: number,
  dispatch: (action: Action) => void,
): DragState {
  const edge = edges.find(ed => ed.id === hit.id);
  dispatch({ type: 'SET_SELECTION', selection: { nodeIds: [], edgeIds: [hit.id!] } });
  dispatch({ type: 'SNAPSHOT' });
  return {
    type: 'move-edge-segment', startWorldX: world.x, startWorldY: world.y,
    startScreenX: sx, startScreenY: sy,
    edgeId: hit.id, segmentDirection: hit.segmentDirection,
    segmentIndex: hit.segmentIndex,
    initialMidpoint: edge?.manualMidpoint,
    initialWaypoints: edge?.manualWaypoints ? [...edge.manualWaypoints.map(w => ({ ...w }))] : undefined,
  };
}

function handleEdgeHit(
  hit: ReturnType<typeof hitTest>,
  edges: readonly GraphEdge[],
  nodes: readonly GraphNode[],
  selection: SelectionState,
  world: { x: number; y: number },
  viewport: Viewport,
  dispatch: (action: Action) => void,
): void {
  let targetId = hit.id!;
  if (selection.edgeIds.includes(hit.id!)) {
    const resolved = resolveEdgesWithWaypoints(edges, nodes);
    const overlapping = resolved.filter(
      ed => ed.id !== hit.id && hitTestEdge(ed, world.x, world.y, viewport.scale),
    );
    if (overlapping.length > 0) targetId = overlapping[0].id;
  }
  dispatch({ type: 'SET_SELECTION', selection: { nodeIds: [], edgeIds: [targetId] } });
}

// ─── handleMouseMove ヘルパー ─────────────────────────────────────────────

function updateCursorForHit(
  fullHit: ReturnType<typeof hitTest>,
  nodes: readonly GraphNode[],
  ctrlOrMeta: boolean,
): string {
  const RESIZE_CURSORS: Record<string, string> = {
    nw: 'nwse-resize', se: 'nwse-resize',
    ne: 'nesw-resize', sw: 'nesw-resize',
    n: 'ns-resize', s: 'ns-resize',
    e: 'ew-resize', w: 'ew-resize',
  };
  if (fullHit.type === 'frame-collapse') return 'pointer';
  if (fullHit.type === 'resize-handle' && fullHit.handle) return RESIZE_CURSORS[fullHit.handle] ?? 'default';
  if (fullHit.type === 'edge-endpoint') return 'crosshair';
  if (fullHit.type === 'connection-point') return 'crosshair';
  if (fullHit.type === 'edge-segment') return fullHit.segmentDirection === 'vertical' ? 'ew-resize' : 'ns-resize';
  if (fullHit.type === 'node') {
    const hitNode = nodes.find(n => n.id === fullHit.id);
    return (ctrlOrMeta && hitNode?.url) ? 'pointer' : 'move';
  }
  if (fullHit.type === 'edge') return 'pointer';
  return 'default';
}

function handleMoveWithSmartGuides(
  initNodes: Map<string, { x: number; y: number; width: number; height: number }>,
  ids: string[],
  dx: number, dy: number,
  nodes: readonly GraphNode[],
  dispatch: (action: Action) => void,
  collisionEnabled: boolean,
  physicsEngine: physics.PhysicsEngine | null | undefined,
): GuideLine[] {
  const draggedInits = ids.flatMap(id => { const init = initNodes.get(id); return init ? [{ id, init }] : []; });
  const bboxX = Math.min(...draggedInits.map(d => d.init.x + dx));
  const bboxY = Math.min(...draggedInits.map(d => d.init.y + dy));
  const bboxRight = Math.max(...draggedInits.map(d => d.init.x + dx + d.init.width));
  const bboxBottom = Math.max(...draggedInits.map(d => d.init.y + dy + d.init.height));

  const otherRects = (nodes as GraphNode[])
    .filter(n => !initNodes.has(n.id))
    .map(n => ({ id: n.id, x: n.x, y: n.y, width: n.width, height: n.height }));

  const result = computeSmartGuides(bboxX, bboxY, bboxRight - bboxX, bboxBottom - bboxY, otherRects, 5);

  const snapDx = result.snappedX - bboxX;
  const snapDy = result.snappedY - bboxY;
  const snapUpdates = ids.flatMap(id => {
    const init = initNodes.get(id);
    return init ? [{ id, x: init.x + dx + snapDx, y: init.y + dy + snapDy }] : [];
  });
  dispatch({ type: 'SET_NODE_POSITIONS', updates: snapUpdates });
  applyCollisionResolution(snapUpdates, initNodes, dispatch, collisionEnabled, physicsEngine);
  return result.guides;
}

function handleMoveWithGrid(
  initNodes: Map<string, { x: number; y: number; width: number; height: number }>,
  ids: string[],
  dx: number, dy: number,
  showGrid: boolean,
  dispatch: (action: Action) => void,
  collisionEnabled: boolean,
  physicsEngine: physics.PhysicsEngine | null | undefined,
): void {
  const moveUpdates = ids.flatMap(id => {
    const init = initNodes.get(id);
    if (!init) return [];
    return [{
      id,
      x: showGrid ? snapToGrid(init.x + dx) : init.x + dx,
      y: showGrid ? snapToGrid(init.y + dy) : init.y + dy,
    }];
  });
  dispatch({ type: 'SET_NODE_POSITIONS', updates: moveUpdates });
  applyCollisionResolution(moveUpdates, initNodes, dispatch, collisionEnabled, physicsEngine);
}

function applyCollisionResolution(
  updates: Array<{ id: string; x: number; y: number }>,
  initNodes: Map<string, { x: number; y: number; width: number; height: number }>,
  dispatch: (action: Action) => void,
  collisionEnabled: boolean,
  physicsEngine: physics.PhysicsEngine | null | undefined,
): void {
  if (!collisionEnabled || !physicsEngine) return;
  for (const u of updates) {
    physicsEngine.updateBody(u.id, { x: u.x, y: u.y });
  }
  const draggedIds = [...initNodes.keys()];
  if (draggedIds.length > 0) {
    const pushed = physicsEngine.resolveCollisions(draggedIds[0]);
    if (pushed.length > 0) {
      dispatch({ type: 'SET_NODE_POSITIONS', updates: pushed });
    }
  }
}

function handleMoveEdgeSegment(
  drag: DragState,
  world: { x: number; y: number },
  dispatch: (action: Action) => void,
): void {
  if (drag.initialWaypoints?.length && drag.segmentIndex !== undefined) {
    const newWaypoints = drag.initialWaypoints.map(w => ({ ...w }));
    const delta = drag.segmentDirection === 'horizontal'
      ? world.y - drag.startWorldY
      : world.x - drag.startWorldX;
    const mwpIdx1 = drag.segmentIndex - 1;
    const mwpIdx2 = drag.segmentIndex;
    if (drag.segmentDirection === 'horizontal') {
      if (mwpIdx1 >= 0 && mwpIdx1 < newWaypoints.length) newWaypoints[mwpIdx1].y += delta;
      if (mwpIdx2 >= 0 && mwpIdx2 < newWaypoints.length) newWaypoints[mwpIdx2].y += delta;
    } else {
      if (mwpIdx1 >= 0 && mwpIdx1 < newWaypoints.length) newWaypoints[mwpIdx1].x += delta;
      if (mwpIdx2 >= 0 && mwpIdx2 < newWaypoints.length) newWaypoints[mwpIdx2].x += delta;
    }
    dispatch({ type: 'UPDATE_EDGE', id: drag.edgeId!, changes: { manualWaypoints: newWaypoints } });
    return;
  }
  const newMidpoint = drag.segmentDirection === 'vertical' ? world.x : world.y;
  dispatch({ type: 'UPDATE_EDGE', id: drag.edgeId!, changes: { manualMidpoint: newMidpoint } });
}

// ─── handleMouseUp ヘルパー ───────────────────────────────────────────────

function finalizeCreateShape(
  drag: DragState,
  world: { x: number; y: number },
  tool: ToolType,
  showGrid: boolean,
  isDark: boolean,
  dispatch: (action: Action) => void,
): void {
  const w = Math.abs(world.x - drag.startWorldX);
  const h = Math.abs(world.y - drag.startWorldY);
  let x = Math.min(world.x, drag.startWorldX);
  let y = Math.min(world.y, drag.startWorldY);
  let fw = Math.max(w, 80);
  let fh = Math.max(h, (tool as string) === 'text' ? 30 : 50);
  if (showGrid) {
    x = snapToGrid(x);
    y = snapToGrid(y);
    fw = snapToGrid(fw);
    fh = snapToGrid(fh);
  }
  const nodeType = tool as NodeType;
  const node = createNode(nodeType, x, y, { width: fw, height: fh }, isDark);
  dispatch({ type: 'ADD_NODE', node });
}

function finalizeCreateEdge(
  drag: DragState,
  world: { x: number; y: number },
  tool: ToolType,
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  viewport: Viewport,
  isDark: boolean,
  dispatch: (action: Action) => void,
  onTextEdit: (nodeId: string) => void,
): void {
  const hit = hitTest({ nodes: nodes as GraphNode[], edges: edges as GraphEdge[], wx: world.x, wy: world.y, scale: viewport.scale, selectedNodeIds: [] });
  const edgeType: 'line' | 'connector' =
    (tool === 'line' || tool === 'connector') ? tool : 'connector';
  const dist = Math.hypot(world.x - drag.startWorldX, world.y - drag.startWorldY);

  if (drag.edgeId && drag.endpointEnd) {
    const targetNodeId = hit.type === 'node' ? hit.id : undefined;
    finalizeEdgeReconnect(drag, world, targetNodeId, dispatch);
    return;
  }

  if (dist <= 5) return;

  if (hit.type === 'node' && hit.id) {
    finalizeEdgeToNode(drag, hit, world, nodes, edgeType, isDark, dispatch);
  } else if (!drag.fromConnectionPoint && (tool === 'line' || tool === 'connector')) {
    finalizeEdgeToEmpty(drag, world, edgeType, isDark, dispatch);
  } else if (drag.fromConnectionPoint) {
    finalizeEdgeWithChildNode(drag, world, nodes, edgeType, isDark, dispatch, onTextEdit);
  }
}

function finalizeEdgeReconnect(
  drag: DragState,
  world: { x: number; y: number },
  targetNodeId: string | undefined,
  dispatch: (action: Action) => void,
): void {
  if (drag.endpointEnd === 'from') {
    dispatch({ type: 'UPDATE_EDGE', id: drag.edgeId!, changes: {
      from: { nodeId: targetNodeId, x: world.x, y: world.y },
      to: { nodeId: drag.nodeId, x: drag.startWorldX, y: drag.startWorldY },
      manualMidpoint: undefined,
    } });
  } else {
    dispatch({ type: 'UPDATE_EDGE', id: drag.edgeId!, changes: {
      from: { nodeId: drag.nodeId, x: drag.startWorldX, y: drag.startWorldY },
      to: { nodeId: targetNodeId, x: world.x, y: world.y },
      manualMidpoint: undefined,
    } });
  }
}

function finalizeEdgeToNode(
  drag: DragState,
  hit: ReturnType<typeof hitTest>,
  world: { x: number; y: number },
  nodes: readonly GraphNode[],
  edgeType: 'line' | 'connector',
  isDark: boolean,
  dispatch: (action: Action) => void,
): void {
  const targetNode = nodes.find(n => n.id === hit.id);
  const bp = targetNode ? nearestBorderPoint(targetNode, world.x, world.y) : null;
  const edge = createEdge(
    edgeType,
    { nodeId: drag.nodeId, x: drag.startWorldX, y: drag.startWorldY },
    { nodeId: hit.id, x: bp?.x ?? world.x, y: bp?.y ?? world.y },
    undefined, isDark,
  );
  dispatch({ type: 'ADD_EDGE', edge });
}

function finalizeEdgeToEmpty(
  drag: DragState,
  world: { x: number; y: number },
  edgeType: 'line' | 'connector',
  isDark: boolean,
  dispatch: (action: Action) => void,
): void {
  const edge = createEdge(
    edgeType,
    { nodeId: drag.nodeId, x: drag.startWorldX, y: drag.startWorldY },
    { x: world.x, y: world.y },
    undefined, isDark,
  );
  dispatch({ type: 'ADD_EDGE', edge });
}

function finalizeEdgeWithChildNode(
  drag: DragState,
  world: { x: number; y: number },
  nodes: readonly GraphNode[],
  edgeType: 'line' | 'connector',
  isDark: boolean,
  dispatch: (action: Action) => void,
  onTextEdit: (nodeId: string) => void,
): void {
  const parentNode = drag.nodeId ? nodes.find(n => n.id === drag.nodeId) : undefined;
  const inferChildType = (type: string | undefined): NodeType => {
    if (type === 'sticky') return 'sticky';
    if (type === 'ellipse') return 'ellipse';
    return 'rect';
  };
  const childType = inferChildType(parentNode?.type);
  const childW = 150;
  const childH = 100;
  const child = createNode(childType, world.x - childW / 2, world.y - childH / 2, {
    width: childW, height: childH,
  }, isDark);
  const edge = createEdge(
    edgeType,
    { nodeId: drag.nodeId, x: drag.startWorldX, y: drag.startWorldY },
    { nodeId: child.id, x: world.x, y: world.y },
    undefined, isDark,
  );
  dispatch({ type: 'ADD_NODE', node: child });
  dispatch({ type: 'ADD_EDGE', edge });
  onTextEdit(child.id);
}

function computePanInertia(
  history: Array<{ x: number; y: number; t: number }>,
): { vx: number; vy: number } {
  if (history.length < 2) return { vx: 0, vy: 0 };
  const first = history[0];
  const last = history.at(-1);
  if (!first || !last) return { vx: 0, vy: 0 };
  const dt = last.t - first.t;
  if (dt <= 0 || dt >= 100) return { vx: 0, vy: 0 };
  return {
    vx: (last.x - first.x) / dt * 16,
    vy: (last.y - first.y) / dt * 16,
  };
}

// ─── handleDoubleClick ヘルパー ───────────────────────────────────────────

function findBestWaypointInsertionIndex(
  world: { x: number; y: number },
  fullPath: Array<{ x: number; y: number }>,
  existingCount: number,
): number {
  let bestIdx = existingCount;
  let bestDist = Infinity;
  for (let i = 0; i < fullPath.length - 1; i++) {
    const p1 = fullPath[i];
    const p2 = fullPath[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((world.x - p1.x) * dx + (world.y - p1.y) * dy) / len2)) : 0;
    const px = p1.x + t * dx;
    const py = p1.y + t * dy;
    const d = Math.hypot(world.x - px, world.y - py);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = Math.max(0, Math.min(existingCount, i));
    }
  }
  return bestIdx;
}

// ─── computeResize ───────────────────────────────────────────────────────

function computeResize(
  init: { x: number; y: number; width: number; height: number },
  handle: ResizeHandle,
  wx: number, wy: number,
  startWx: number, startWy: number,
): { x: number; y: number; width: number; height: number } {
  const dx = wx - startWx;
  const dy = wy - startWy;
  let { x, y, width, height } = init;
  const MIN = 20;

  if (handle.includes('e')) { width = Math.max(MIN, init.width + dx); }
  if (handle.includes('w')) { width = Math.max(MIN, init.width - dx); x = init.x + init.width - width; }
  if (handle.includes('s')) { height = Math.max(MIN, init.height + dy); }
  if (handle.includes('n')) { height = Math.max(MIN, init.height - dy); y = init.y + init.height - height; }

  return { x, y, width, height };
}

// ─── createCanvasInteraction （メイン factory） ───────────────────────────

/**
 * canvas に対するマウス・キーボード・クリップボード操作を管理する vanilla TS factory。
 * React 依存なし。`useCanvasInteraction` フックの完全等価実装。
 *
 * @returns CanvasInteractionHandle — destroy() で全リスナを解除する
 */
export function createCanvasInteraction(deps: CanvasInteractionDeps): CanvasInteractionHandle {
  const { canvas, dispatch, onTextEdit, onToolChange } = deps;

  // ── closure 変数（useRef 相当） ──
  let drag: DragState = { ...EMPTY_DRAG };
  let space = false;
  let preview: DragPreview = { ...EMPTY_PREVIEW };
  let clipboard: { nodes: GraphNode[]; edges: GraphEdge[] } | null = null;
  let hoverNodeId: string | undefined = undefined;
  let mouseWorld: { x: number; y: number } = { x: 0, y: 0 };
  let cursor = 'default';
  let velocity: { vx: number; vy: number } = { vx: 0, vy: 0 };
  let panHistory: { x: number; y: number; t: number }[] = [];

  // ── ヘルパー ──

  function getWorldPos(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return screenToWorld(deps.getViewport(), clientX - rect.left, clientY - rect.top);
  }

  // ── マウスイベント ──

  function handleMouseDown(e: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const viewport = deps.getViewport();
    const world = screenToWorld(viewport, sx, sy);
    const tool = deps.getTool();
    const nodes = deps.getNodes();
    const edges = deps.getEdges();
    const selection = deps.getSelection();

    if (space || e.button === 1 || tool === 'pan') {
      drag = { type: 'pan', startWorldX: 0, startWorldY: 0, startScreenX: sx, startScreenY: sy };
      return;
    }

    if (tool === 'select') {
      const resolved = resolveEdgesWithWaypoints(edges, nodes);
      const hit = hitTest({ nodes: nodes as GraphNode[], edges: resolved, wx: world.x, wy: world.y, scale: viewport.scale, selectedNodeIds: selection.nodeIds, hoverNodeId, selectedEdgeIds: selection.edgeIds });
      const result = handleSelectHit(hit, nodes, edges, selection, world, sx, sy, e, viewport, dispatch, deps.physics);
      if (result) drag = result;
      return;
    }

    if (['rect', 'ellipse', 'sticky', 'text', 'diamond', 'parallelogram', 'cylinder', 'doc', 'frame'].includes(tool)) {
      drag = {
        type: 'create-shape', startWorldX: world.x, startWorldY: world.y,
        startScreenX: sx, startScreenY: sy,
      };
      return;
    }

    if (['line', 'connector'].includes(tool)) {
      const hit = hitTest({ nodes: nodes as GraphNode[], edges: edges as GraphEdge[], wx: world.x, wy: world.y, scale: viewport.scale, selectedNodeIds: [] });
      let startX = world.x;
      let startY = world.y;
      if (hit.type === 'node' && hit.id) {
        const node = nodes.find(n => n.id === hit.id);
        if (node) {
          const bp = nearestBorderPoint(node, world.x, world.y);
          if (bp) { startX = bp.x; startY = bp.y; }
        }
      }
      drag = {
        type: 'create-edge', startWorldX: startX, startWorldY: startY,
        startScreenX: sx, startScreenY: sy,
        nodeId: hit.type === 'node' ? hit.id : undefined,
      };
    }
  }

  function handleMouseMove(e: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const viewport = deps.getViewport();
    const tool = deps.getTool();
    const nodes = deps.getNodes();
    const edges = deps.getEdges();
    const selection = deps.getSelection();
    const showGrid = deps.getShowGrid();
    const collisionEnabled = deps.getCollisionEnabled();

    if (drag.type === 'none') {
      if (tool === 'pan') {
        cursor = 'grab';
      } else if (['rect', 'ellipse', 'sticky', 'text', 'diamond', 'parallelogram', 'cylinder', 'doc', 'line', 'connector'].includes(tool)) {
        cursor = 'crosshair';
      }
    }

    if (drag.type === 'none' && tool === 'select') {
      const world = screenToWorld(viewport, sx, sy);
      mouseWorld = world;
      const resolved = resolveEdgesWithWaypoints(edges, nodes);
      const fullHit = hitTest({ nodes: nodes as GraphNode[], edges: resolved, wx: world.x, wy: world.y, scale: viewport.scale, selectedNodeIds: selection.nodeIds, selectedEdgeIds: selection.edgeIds });
      const hoverHit = hitTest({ nodes: nodes as GraphNode[], edges: resolved, wx: world.x, wy: world.y, scale: viewport.scale, selectedNodeIds: [] });
      hoverNodeId = hoverHit.type === 'node' ? hoverHit.id : undefined;
      cursor = updateCursorForHit(fullHit, nodes, e.ctrlKey || e.metaKey);
    } else if (drag.type === 'move' || drag.type === 'pan') {
      cursor = 'grabbing';
      hoverNodeId = undefined;
    } else if (drag.type === 'resize') {
      hoverNodeId = undefined;
    } else if (drag.type === 'create-edge' || drag.type === 'create-shape') {
      cursor = 'crosshair';
      hoverNodeId = undefined;
    } else if (drag.type !== 'none') {
      hoverNodeId = undefined;
    }

    canvas.style.cursor = cursor;

    if (drag.type === 'pan') {
      const dx = sx - drag.startScreenX;
      const dy = sy - drag.startScreenY;
      dispatch({ type: 'SET_VIEWPORT', viewport: panViewport(viewport, dx, dy) });
      drag = { ...drag, startScreenX: sx, startScreenY: sy };

      const now = performance.now();
      panHistory.push({ x: sx, y: sy, t: now });
      if (panHistory.length > 3) panHistory.shift();
      return;
    }

    if (drag.type === 'move' && drag.initialNodes) {
      const initNodes = drag.initialNodes;
      const world = screenToWorld(viewport, sx, sy);
      const dx = world.x - drag.startWorldX;
      const dy = world.y - drag.startWorldY;
      const ids = [...initNodes.keys()];

      if (!showGrid && ids.length > 0) {
        const guides = handleMoveWithSmartGuides(initNodes, ids, dx, dy, nodes, dispatch, collisionEnabled, deps.physics);
        preview = { type: 'none', fromX: 0, fromY: 0, toX: 0, toY: 0, guides };
      } else {
        handleMoveWithGrid(initNodes, ids, dx, dy, showGrid, dispatch, collisionEnabled, deps.physics);
        preview = { type: 'none', fromX: 0, fromY: 0, toX: 0, toY: 0 };
      }
      return;
    }

    if (drag.type === 'resize' && drag.nodeId && drag.handle && drag.initialNodes) {
      const world = screenToWorld(viewport, sx, sy);
      const init = drag.initialNodes.get(drag.nodeId);
      if (!init) return;
      const MIN = 20;
      const resized = computeResize(init, drag.handle, world.x, world.y, drag.startWorldX, drag.startWorldY);
      const x = showGrid ? snapToGrid(resized.x) : resized.x;
      const y = showGrid ? snapToGrid(resized.y) : resized.y;
      const width = showGrid ? Math.max(MIN, snapToGrid(resized.width)) : resized.width;
      const height = showGrid ? Math.max(MIN, snapToGrid(resized.height)) : resized.height;
      dispatch({ type: 'RESIZE_NODE', id: drag.nodeId, x, y, width, height });
      return;
    }

    if (drag.type === 'move-waypoint' && drag.edgeId && drag.waypointIndex !== undefined && drag.initialWaypoints) {
      const world = screenToWorld(viewport, sx, sy);
      const newWaypoints = drag.initialWaypoints.map(w => ({ ...w }));
      newWaypoints[drag.waypointIndex] = { x: world.x, y: world.y };
      dispatch({ type: 'UPDATE_EDGE', id: drag.edgeId, changes: { manualWaypoints: newWaypoints } });
      return;
    }

    if (drag.type === 'move-edge-segment' && drag.edgeId) {
      const world = screenToWorld(viewport, sx, sy);
      handleMoveEdgeSegment(drag, world, dispatch);
      return;
    }

    if (drag.type === 'create-edge') {
      const world = screenToWorld(viewport, sx, sy);
      const hit = hitTest({ nodes: nodes as GraphNode[], edges: edges as GraphEdge[], wx: world.x, wy: world.y, scale: viewport.scale, selectedNodeIds: [] });
      const tool2 = deps.getTool();
      preview = {
        type: 'edge',
        fromX: drag.startWorldX, fromY: drag.startWorldY,
        toX: world.x, toY: world.y,
        edgeType: (tool2 === 'line' || tool2 === 'connector') ? tool2 : 'connector',
        snapNodeId: hit.type === 'node' ? hit.id : undefined,
      };
      return;
    }

    if (drag.type === 'create-shape') {
      const world = screenToWorld(viewport, sx, sy);
      const tool3 = deps.getTool();
      preview = {
        type: 'shape',
        fromX: drag.startWorldX, fromY: drag.startWorldY,
        toX: world.x, toY: world.y,
        shapeType: tool3 as 'rect' | 'ellipse' | 'sticky' | 'text' | 'diamond' | 'parallelogram' | 'cylinder' | 'doc' | 'frame',
      };
      return;
    }

    if (drag.type === 'select-rect') {
      const world = screenToWorld(viewport, sx, sy);
      preview = {
        type: 'select-rect',
        fromX: drag.startWorldX, fromY: drag.startWorldY,
        toX: world.x, toY: world.y,
      };
    }
  }

  function handleMouseUp(e: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const viewport = deps.getViewport();
    const world = screenToWorld(viewport, sx, sy);
    const tool = deps.getTool();
    const nodes = deps.getNodes();
    const edges = deps.getEdges();
    const showGrid = deps.getShowGrid();
    const isDark = deps.getIsDark();

    if (drag.type === 'create-shape') {
      finalizeCreateShape(drag, world, tool, showGrid, isDark, dispatch);
      onToolChange('select');
    }

    if (drag.type === 'create-edge') {
      finalizeCreateEdge(drag, world, tool, nodes, edges, viewport, isDark, dispatch, onTextEdit);
      onToolChange('select');
    }

    if (drag.type === 'select-rect') {
      const minX = Math.min(drag.startWorldX, world.x);
      const maxX = Math.max(drag.startWorldX, world.x);
      const minY = Math.min(drag.startWorldY, world.y);
      const maxY = Math.max(drag.startWorldY, world.y);
      if (maxX - minX > 2 || maxY - minY > 2) {
        const selectedIds = (nodes as GraphNode[])
          .filter(n => n.x + n.width >= minX && n.x <= maxX && n.y + n.height >= minY && n.y <= maxY)
          .map(n => n.id);
        dispatch({ type: 'SET_SELECTION', selection: { nodeIds: selectedIds, edgeIds: [] } });
      }
    }

    if (drag.type === 'pan') {
      velocity = computePanInertia(panHistory);
      panHistory = [];
    }

    drag = { ...EMPTY_DRAG };
    preview = { ...EMPTY_PREVIEW };
  }

  function handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const viewport = deps.getViewport();
    dispatch({ type: 'SET_VIEWPORT', viewport: zoomViewport(viewport, sx, sy, e.deltaY) });
  }

  function handleDoubleClick(e: MouseEvent): void {
    const world = getWorldPos(e.clientX, e.clientY);
    const viewport = deps.getViewport();
    const nodes = deps.getNodes();
    const edges = deps.getEdges();
    const selection = deps.getSelection();
    const hit = hitTest({ nodes: nodes as GraphNode[], edges: edges as GraphEdge[], wx: world.x, wy: world.y, scale: viewport.scale, selectedNodeIds: selection.nodeIds, selectedEdgeIds: selection.edgeIds });
    if (hit.type === 'node' && hit.id) {
      onTextEdit(hit.id);
      return;
    }
    if (hit.type === 'waypoint-handle' && hit.id && hit.waypointIndex !== undefined) {
      const edge = edges.find(ed => ed.id === hit.id);
      if (edge?.manualWaypoints) {
        dispatch({ type: 'SNAPSHOT' });
        const newWaypoints = edge.manualWaypoints.filter((_, i) => i !== hit.waypointIndex);
        dispatch({ type: 'UPDATE_EDGE', id: hit.id, changes: { manualWaypoints: newWaypoints.length > 0 ? newWaypoints : undefined } });
      }
      return;
    }
    if (hit.type === 'edge' && hit.id) {
      const edge = edges.find(ed => ed.id === hit.id);
      if (edge?.type === 'connector') {
        dispatch({ type: 'SNAPSHOT' });
        const existing = edge.manualWaypoints ?? [];
        const wp = { x: world.x, y: world.y };
        if (existing.length === 0 || !edge.waypoints?.length) {
          dispatch({ type: 'UPDATE_EDGE', id: hit.id, changes: { manualWaypoints: [...existing, wp] } });
        } else {
          const bestIdx = findBestWaypointInsertionIndex(world, edge.waypoints, existing.length);
          const newWaypoints = [...existing];
          newWaypoints.splice(bestIdx, 0, wp);
          dispatch({ type: 'UPDATE_EDGE', id: hit.id, changes: { manualWaypoints: newWaypoints } });
        }
        dispatch({ type: 'SET_SELECTION', selection: { nodeIds: [], edgeIds: [hit.id] } });
      }
    }
  }

  // ── クリップボード ──

  function copySelected(): void {
    const selection = deps.getSelection();
    if (selection.nodeIds.length === 0) return;
    const nodes = deps.getNodes();
    const edges = deps.getEdges();
    const selectedSet = new Set(selection.nodeIds);
    const copiedNodes: GraphNode[] = JSON.parse(JSON.stringify((nodes as GraphNode[]).filter(n => selectedSet.has(n.id))));
    const copiedEdges: GraphEdge[] = JSON.parse(JSON.stringify(
      (edges as GraphEdge[]).filter(edge => selectedSet.has(edge.from.nodeId ?? '') && selectedSet.has(edge.to.nodeId ?? '')),
    ));
    clipboard = { nodes: copiedNodes, edges: copiedEdges };
    try {
      const data = JSON.stringify({ type: 'anytime-graph', nodes: copiedNodes, edges: copiedEdges });
      navigator.clipboard.writeText(data).catch(() => {/* ignore clipboard errors */});
    } catch {
      // Clipboard API not available, internal clipboard still works
    }
  }

  async function pasteFromClipboard(): Promise<void> {
    const doPaste = (sourceNodes: GraphNode[], sourceEdges: GraphEdge[]): { nodes: GraphNode[]; edges: GraphEdge[] } => {
      const idMap = new Map<string, string>();
      const newNodes = sourceNodes.map(n => {
        const newId = crypto.randomUUID();
        idMap.set(n.id, newId);
        return { ...n, id: newId, x: n.x + 20, y: n.y + 20 };
      });
      const newEdges = sourceEdges.map(edge => ({
        ...edge,
        id: crypto.randomUUID(),
        from: { ...edge.from, nodeId: edge.from.nodeId ? idMap.get(edge.from.nodeId) : undefined },
        to: { ...edge.to, nodeId: edge.to.nodeId ? idMap.get(edge.to.nodeId) : undefined },
      }));
      dispatch({ type: 'PASTE_NODES', nodes: newNodes, edges: newEdges });
      return {
        nodes: sourceNodes.map(n => ({ ...n, x: n.x + 20, y: n.y + 20 })),
        edges: sourceEdges,
      };
    };

    try {
      const text = await navigator.clipboard.readText();
      const parsed = JSON.parse(text) as unknown;
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        (parsed as Record<string, unknown>)['type'] === 'anytime-graph' &&
        Array.isArray((parsed as Record<string, unknown>)['nodes'])
      ) {
        const p = parsed as { nodes: GraphNode[]; edges: GraphEdge[] };
        const updated = doPaste(p.nodes, p.edges ?? []);
        clipboard = updated;
        try {
          const data = JSON.stringify({ type: 'anytime-graph', nodes: updated.nodes, edges: updated.edges });
          navigator.clipboard.writeText(data).catch(() => {/* ignore */});
        } catch {
          // ignore
        }
        return;
      }
    } catch {
      // Fall through to internal clipboard
    }

    if (!clipboard) return;
    clipboard = doPaste(clipboard.nodes, clipboard.edges);
  }

  // ── キーボード ──

  function handleKeyDown(e: KeyboardEvent): void {
    const selection = deps.getSelection();
    const nodes = deps.getNodes();

    if (e.code === 'Space' && !e.repeat) {
      space = true;
      canvas.style.cursor = 'grab';
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      dispatch({ type: 'SET_SELECTION', selection: { nodeIds: [], edgeIds: [] } });
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && (selection.nodeIds.length > 0 || selection.edgeIds.length > 0)) {
      e.preventDefault();
      const hasLocked = selection.nodeIds.some(id => nodes.find(n => n.id === id)?.locked);
      if (hasLocked) {
        const unlocked = selection.nodeIds.filter(id => !nodes.find(n => n.id === id)?.locked);
        dispatch({ type: 'SET_SELECTION', selection: { nodeIds: unlocked, edgeIds: selection.edgeIds } });
      }
      dispatch({ type: 'DELETE_SELECTED' });
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      const onLiveMessage = deps.onLiveMessage;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); dispatch({ type: 'UNDO' }); onLiveMessage?.('undo'); return; }
      if ((e.key === 'y') || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); dispatch({ type: 'REDO' }); onLiveMessage?.('redo'); return; }
      if (e.key === 'g' && !e.shiftKey) { e.preventDefault(); dispatch({ type: 'GROUP_SELECTED', groupId: crypto.randomUUID() }); return; }
      if (e.key === 'g' && e.shiftKey) { e.preventDefault(); dispatch({ type: 'UNGROUP_SELECTED' }); return; }
      if (e.key === 'a') {
        e.preventDefault();
        dispatch({ type: 'SET_SELECTION', selection: { nodeIds: (nodes as GraphNode[]).map(n => n.id), edgeIds: [] } });
        return;
      }
      if (e.key === 'c') { e.preventDefault(); copySelected(); return; }
      if (e.key === 'v') { e.preventDefault(); pasteFromClipboard(); return; }
    }
  }

  function handleKeyUp(e: KeyboardEvent): void {
    if (e.code === 'Space') {
      space = false;
      canvas.style.cursor = 'default';
    }
  }

  // ── window mouseup（canvas 外でボタンを離した場合のドラッグ解除） ──

  function handleWindowMouseUp(): void {
    if (drag.type !== 'none') {
      drag = { ...EMPTY_DRAG };
      preview = { ...EMPTY_PREVIEW };
    }
  }

  // ── リスナ登録 ──

  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseup', handleMouseUp);
  canvas.addEventListener('wheel', handleWheel, { passive: false });
  canvas.addEventListener('dblclick', handleDoubleClick);
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('mouseup', handleWindowMouseUp);

  // ── destroy ──

  function destroy(): void {
    canvas.removeEventListener('mousedown', handleMouseDown);
    canvas.removeEventListener('mousemove', handleMouseMove);
    canvas.removeEventListener('mouseup', handleMouseUp);
    canvas.removeEventListener('wheel', handleWheel);
    canvas.removeEventListener('dblclick', handleDoubleClick);
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    window.removeEventListener('mouseup', handleWindowMouseUp);
  }

  // ── handle（closure 変数は getter で公開） ──
  // NOTE: drag/preview/clipboard 等は closure 変数のため、呼び出し側は
  //       handle.drag ではなく handle 上の getter でアクセスする。
  //       ここでは単純なオブジェクトプロパティとして公開し、
  //       renderer 等から参照される想定。
  const handle: CanvasInteractionHandle = {
    destroy,
    get drag() { return drag; },
    get preview() { return preview; },
    get clipboard() { return clipboard; },
    set clipboard(v) { clipboard = v; },
    get hoverNodeId() { return hoverNodeId; },
    get mouseWorld() { return mouseWorld; },
    get cursor() { return cursor; },
    get velocity() { return velocity; },
    handleKeyDown,
    copySelected,
    pasteFromClipboard,
  };

  return handle;
}
