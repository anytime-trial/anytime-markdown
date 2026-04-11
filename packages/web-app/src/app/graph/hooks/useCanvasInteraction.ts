'use client';

import { computeVisibilityPath } from '@anytime-markdown/graph-core/engine';
import { physics } from '@anytime-markdown/graph-core/engine';
import { useCallback, useEffect,useRef } from 'react';

import {
  bestSides, computeOrthogonalPath, getConnectionPoints, nearestBorderPoint, resolveConnectorEndpoints,
  snapToGrid, hitTest, hitTestEdge, computeSmartGuides,
  pan as panViewport, screenToWorld, zoom as zoomViewport,
} from '@anytime-markdown/graph-core/engine';
import type { ResizeHandle, GuideLine } from '@anytime-markdown/graph-core/engine';
import { createEdge,createNode, GraphEdge, GraphNode, SelectionState, ToolType, Viewport } from '../types';
import type { NodeType } from '../types';
import type { Action } from './useGraphState';

/** edges に waypoints を付与して hitTest で使えるようにする */
function resolveEdgesWithWaypoints(edges: GraphEdge[], nodes: GraphNode[]): (GraphEdge & { waypoints?: { x: number; y: number }[] })[] {
  return edges.map(e => {
    if (e.type === 'connector' && e.from.nodeId && e.to.nodeId) {
      const fromNode = nodes.find(n => n.id === e.from.nodeId);
      const toNode = nodes.find(n => n.id === e.to.nodeId);
      if (fromNode && toNode) {
        // straight ルーティングの場合は直線（waypoints なし）
        if ((e.style.routing) === 'straight') {
          const pts = resolveConnectorEndpoints(e, nodes);
          return { ...e, from: { ...e.from, ...pts.from }, to: { ...e.to, ...pts.to } };
        }
        // manualWaypoints がある場合はそのパスを使用
        if (e.manualWaypoints?.length) {
          const pts = resolveConnectorEndpoints(e, nodes);
          return { ...e, waypoints: [pts.from, ...e.manualWaypoints, pts.to] };
        }
        // manualMidpoint backward compat
        if (e.manualMidpoint !== undefined) {
          const waypoints = computeOrthogonalPath(fromNode, toNode, 20, e.manualMidpoint);
          return { ...e, waypoints };
        }
        // Orthogonal routing
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

interface UseCanvasInteractionProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  tool: ToolType;
  nodes: GraphNode[];
  edges: GraphEdge[];
  viewport: Viewport;
  selection: SelectionState;
  dispatch: React.Dispatch<Action>;
  onTextEdit: (nodeId: string) => void;
  onToolChange: (tool: ToolType) => void;
  showGrid: boolean;
  onLiveMessage?: (message: string) => void;
  isDark?: boolean;
  collisionEnabled?: boolean;
  physicsRef?: React.RefObject<physics.PhysicsEngine | null>;
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

const EMPTY_PREVIEW: DragPreview = { type: 'none', fromX: 0, fromY: 0, toX: 0, toY: 0 };
const EMPTY_DRAG: DragState = { type: 'none', startWorldX: 0, startWorldY: 0, startScreenX: 0, startScreenY: 0 };

// ── handleMouseDown ヘルパー ──

/** select ツールのヒット結果に基づきドラッグ状態を決定 */
function handleSelectHit(
  hit: ReturnType<typeof hitTest>,
  nodes: GraphNode[],
  edges: GraphEdge[],
  selection: SelectionState,
  world: { x: number; y: number },
  sx: number, sy: number,
  e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  viewport: Viewport,
  dispatch: React.Dispatch<Action>,
  physicsRef: React.RefObject<physics.PhysicsEngine | null> | undefined,
  hoverNodeIdRef: React.RefObject<string | undefined>,
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
    return handleNodeHit(hit, nodes, selection, world, sx, sy, e, dispatch, physicsRef);
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
  // 空白クリック → 選択矩形開始
  if (!e.shiftKey) {
    dispatch({ type: 'SET_SELECTION', selection: { nodeIds: [], edgeIds: [] } });
  }
  return { type: 'select-rect', startWorldX: world.x, startWorldY: world.y, startScreenX: sx, startScreenY: sy };
}

function handleFrameCollapseHit(
  hit: ReturnType<typeof hitTest>,
  nodes: GraphNode[],
  dispatch: React.Dispatch<Action>,
): null {
  const frameNode = nodes.find(n => n.id === hit.id);
  if (frameNode) {
    dispatch({ type: 'UPDATE_NODE', id: hit.id!, changes: { collapsed: !(frameNode.collapsed ?? false) } });
  }
  return null;
}

function handleEdgeEndpointHit(
  hit: ReturnType<typeof hitTest>,
  edges: GraphEdge[],
  sx: number, sy: number,
  dispatch: React.Dispatch<Action>,
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
  nodes: GraphNode[],
  world: { x: number; y: number },
  sx: number, sy: number,
  dispatch: React.Dispatch<Action>,
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
  nodes: GraphNode[],
  selection: SelectionState,
  world: { x: number; y: number },
  sx: number, sy: number,
  e: { shiftKey: boolean },
  dispatch: React.Dispatch<Action>,
  physicsRef: React.RefObject<physics.PhysicsEngine | null> | undefined,
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
  if (physicsRef?.current) {
    physicsRef.current.syncFromNodes(nodes);
  }
  dispatch({ type: 'SNAPSHOT' });
  return {
    type: 'move', startWorldX: world.x, startWorldY: world.y,
    startScreenX: sx, startScreenY: sy, initialNodes,
  };
}

/** ノード選択IDの計算（Shift, グループ展開含む） */
function computeNodeSelection(
  hitId: string,
  isSelected: boolean,
  selection: SelectionState,
  nodes: GraphNode[],
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

/** フレーム選択時に内部ノードも含める */
function expandFrameSelection(selectedIds: string[], nodes: GraphNode[]): string[] {
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
  edges: GraphEdge[],
  world: { x: number; y: number },
  sx: number, sy: number,
  dispatch: React.Dispatch<Action>,
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
  edges: GraphEdge[],
  world: { x: number; y: number },
  sx: number, sy: number,
  dispatch: React.Dispatch<Action>,
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
  edges: GraphEdge[],
  nodes: GraphNode[],
  selection: SelectionState,
  world: { x: number; y: number },
  viewport: Viewport,
  dispatch: React.Dispatch<Action>,
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

// ── handleMouseMove ヘルパー ──

/** ドラッグ中でないときのカーソル設定 */
function updateCursorForHit(
  fullHit: ReturnType<typeof hitTest>,
  nodes: GraphNode[],
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

/** ノードドラッグ中のスマートガイド処理 */
function handleMoveWithSmartGuides(
  initNodes: Map<string, { x: number; y: number; width: number; height: number }>,
  ids: string[],
  dx: number, dy: number,
  nodes: GraphNode[],
  dispatch: React.Dispatch<Action>,
  collisionEnabled: boolean | undefined,
  physicsRef: React.RefObject<physics.PhysicsEngine | null> | undefined,
): GuideLine[] {
  const draggedInits = ids.flatMap(id => { const init = initNodes.get(id); return init ? [{ id, init }] : []; });
  const bboxX = Math.min(...draggedInits.map(d => d.init.x + dx));
  const bboxY = Math.min(...draggedInits.map(d => d.init.y + dy));
  const bboxRight = Math.max(...draggedInits.map(d => d.init.x + dx + d.init.width));
  const bboxBottom = Math.max(...draggedInits.map(d => d.init.y + dy + d.init.height));

  const otherRects = nodes
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
  applyCollisionResolution(snapUpdates, initNodes, dispatch, collisionEnabled, physicsRef);
  return result.guides;
}

/** ノードドラッグ中のグリッドスナップ処理 */
function handleMoveWithGrid(
  initNodes: Map<string, { x: number; y: number; width: number; height: number }>,
  ids: string[],
  dx: number, dy: number,
  showGrid: boolean,
  dispatch: React.Dispatch<Action>,
  collisionEnabled: boolean | undefined,
  physicsRef: React.RefObject<physics.PhysicsEngine | null> | undefined,
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
  applyCollisionResolution(moveUpdates, initNodes, dispatch, collisionEnabled, physicsRef);
}

/** コリジョン解決の適用 */
function applyCollisionResolution(
  updates: Array<{ id: string; x: number; y: number }>,
  initNodes: Map<string, { x: number; y: number; width: number; height: number }>,
  dispatch: React.Dispatch<Action>,
  collisionEnabled: boolean | undefined,
  physicsRef: React.RefObject<physics.PhysicsEngine | null> | undefined,
): void {
  if (!collisionEnabled || !physicsRef?.current) return;
  for (const u of updates) {
    physicsRef.current.updateBody(u.id, { x: u.x, y: u.y });
  }
  const draggedIds = [...initNodes.keys()];
  if (draggedIds.length > 0) {
    const pushed = physicsRef.current.resolveCollisions(draggedIds[0]);
    if (pushed.length > 0) {
      dispatch({ type: 'SET_NODE_POSITIONS', updates: pushed });
    }
  }
}

/** エッジセグメントのドラッグ処理 */
function handleMoveEdgeSegment(
  drag: DragState,
  world: { x: number; y: number },
  dispatch: React.Dispatch<Action>,
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

// ── handleMouseUp ヘルパー ──

/** シェイプ作成完了処理 */
function finalizeCreateShape(
  drag: DragState,
  world: { x: number; y: number },
  tool: ToolType,
  showGrid: boolean,
  isDark: boolean,
  dispatch: React.Dispatch<Action>,
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

/** エッジ作成/再接続完了処理 */
function finalizeCreateEdge(
  drag: DragState,
  world: { x: number; y: number },
  tool: ToolType,
  nodes: GraphNode[],
  edges: GraphEdge[],
  viewport: Viewport,
  isDark: boolean,
  dispatch: React.Dispatch<Action>,
  onTextEdit: (nodeId: string) => void,
): void {
  const hit = hitTest({ nodes, edges, wx: world.x, wy: world.y, scale: viewport.scale, selectedNodeIds: [] });
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
  dispatch: React.Dispatch<Action>,
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
  nodes: GraphNode[],
  edgeType: 'line' | 'connector',
  isDark: boolean,
  dispatch: React.Dispatch<Action>,
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
  dispatch: React.Dispatch<Action>,
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
  nodes: GraphNode[],
  edgeType: 'line' | 'connector',
  isDark: boolean,
  dispatch: React.Dispatch<Action>,
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

/** パン終了時の慣性速度算出 */
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

// ── handleDoubleClick ヘルパー ──

/** ウェイポイントの最適挿入位置を計算 */
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

export function useCanvasInteraction({
  canvasRef, tool, nodes, edges, viewport, selection, dispatch, onTextEdit, onToolChange, showGrid, onLiveMessage, isDark = true, collisionEnabled, physicsRef,
}: UseCanvasInteractionProps) {
  const dragRef = useRef<DragState>({
    type: 'none', startWorldX: 0, startWorldY: 0, startScreenX: 0, startScreenY: 0,
  });
  const spaceRef = useRef(false);
  const previewRef = useRef<DragPreview>({ ...EMPTY_PREVIEW });
  const clipboardRef = useRef<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null);
  const hoverNodeIdRef = useRef<string | undefined>(undefined);
  const mouseWorldRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const cursorRef = useRef<string>('default');
  const velocityRef = useRef<{ vx: number; vy: number }>({ vx: 0, vy: 0 });
  const panHistoryRef = useRef<{ x: number; y: number; t: number }[]>([]);

  const getWorldPos = useCallback((e: MouseEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return screenToWorld(viewport, e.clientX - rect.left, e.clientY - rect.top);
  }, [canvasRef, viewport]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(viewport, sx, sy);

    if (spaceRef.current || e.button === 1 || tool === 'pan') {
      dragRef.current = { type: 'pan', startWorldX: 0, startWorldY: 0, startScreenX: sx, startScreenY: sy };
      return;
    }

    if (tool === 'select') {
      const resolved = resolveEdgesWithWaypoints(edges, nodes);
      const hit = hitTest({ nodes, edges: resolved, wx: world.x, wy: world.y, scale: viewport.scale, selectedNodeIds: selection.nodeIds, hoverNodeId: hoverNodeIdRef.current, selectedEdgeIds: selection.edgeIds });
      const result = handleSelectHit(hit, nodes, edges, selection, world, sx, sy, e, viewport, dispatch, physicsRef, hoverNodeIdRef);
      if (result) dragRef.current = result;
      return;
    }

    if (['rect', 'ellipse', 'sticky', 'text', 'diamond', 'parallelogram', 'cylinder', 'doc', 'frame'].includes(tool)) {
      dragRef.current = {
        type: 'create-shape', startWorldX: world.x, startWorldY: world.y,
        startScreenX: sx, startScreenY: sy,
      };
      return;
    }

    if (['line', 'connector'].includes(tool)) {
      const hit = hitTest({ nodes, edges, wx: world.x, wy: world.y, scale: viewport.scale, selectedNodeIds: [] });
      let startX = world.x;
      let startY = world.y;
      if (hit.type === 'node' && hit.id) {
        const node = nodes.find(n => n.id === hit.id);
        if (node) {
          const bp = nearestBorderPoint(node, world.x, world.y);
          if (bp) { startX = bp.x; startY = bp.y; }
        }
      }
      dragRef.current = {
        type: 'create-edge', startWorldX: startX, startWorldY: startY,
        startScreenX: sx, startScreenY: sy,
        nodeId: hit.type === 'node' ? hit.id : undefined,
      };
    }
  }, [canvasRef, viewport, tool, nodes, edges, selection, dispatch, physicsRef]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const drag = dragRef.current;

    // ツール別デフォルトカーソル（ドラッグ中でないとき）
    if (drag.type === 'none') {
      if (tool === 'pan') {
        cursorRef.current = 'grab';
      } else if (['rect', 'ellipse', 'sticky', 'text', 'diamond', 'parallelogram', 'cylinder', 'doc', 'line', 'connector'].includes(tool)) {
        cursorRef.current = 'crosshair';
      }
    }

    // ホバーノード検出 + カーソル更新（ドラッグ中でないとき）
    if (drag.type === 'none' && tool === 'select') {
      const world = screenToWorld(viewport, sx, sy);
      mouseWorldRef.current = world;
      const resolved = resolveEdgesWithWaypoints(edges, nodes);
      const fullHit = hitTest({ nodes, edges: resolved, wx: world.x, wy: world.y, scale: viewport.scale, selectedNodeIds: selection.nodeIds, selectedEdgeIds: selection.edgeIds });
      const hoverHit = hitTest({ nodes, edges: resolved, wx: world.x, wy: world.y, scale: viewport.scale, selectedNodeIds: [] });
      hoverNodeIdRef.current = hoverHit.type === 'node' ? hoverHit.id : undefined;
      cursorRef.current = updateCursorForHit(fullHit, nodes, e.ctrlKey || e.metaKey);
    } else if (drag.type === 'move' || drag.type === 'pan') {
      cursorRef.current = 'grabbing';
      hoverNodeIdRef.current = undefined;
    } else if (drag.type === 'resize') {
      // リサイズ中はカーソル維持
      hoverNodeIdRef.current = undefined;
    } else if (drag.type === 'create-edge' || drag.type === 'create-shape') {
      cursorRef.current = 'crosshair';
      hoverNodeIdRef.current = undefined;
    } else if (drag.type !== 'none') {
      hoverNodeIdRef.current = undefined;
    }

    // カーソルをcanvasに反映
    if (canvasRef.current) {
      canvasRef.current.style.cursor = cursorRef.current;
    }

    if (drag.type === 'pan') {
      const dx = sx - drag.startScreenX;
      const dy = sy - drag.startScreenY;
      dispatch({ type: 'SET_VIEWPORT', viewport: panViewport(viewport, dx, dy) });
      dragRef.current = { ...drag, startScreenX: sx, startScreenY: sy };

      // 速度履歴記録（直近3フレーム）
      const now = performance.now();
      panHistoryRef.current.push({ x: sx, y: sy, t: now });
      if (panHistoryRef.current.length > 3) panHistoryRef.current.shift();
      return;
    }

    if (drag.type === 'move' && drag.initialNodes) {
      const initNodes = drag.initialNodes;
      const world = screenToWorld(viewport, sx, sy);
      const dx = world.x - drag.startWorldX;
      const dy = world.y - drag.startWorldY;
      const ids = [...initNodes.keys()];

      if (!showGrid && ids.length > 0) {
        const guides = handleMoveWithSmartGuides(initNodes, ids, dx, dy, nodes, dispatch, collisionEnabled, physicsRef);
        previewRef.current = { type: 'none', fromX: 0, fromY: 0, toX: 0, toY: 0, guides };
      } else {
        handleMoveWithGrid(initNodes, ids, dx, dy, showGrid, dispatch, collisionEnabled, physicsRef);
        previewRef.current = { type: 'none', fromX: 0, fromY: 0, toX: 0, toY: 0 };
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
      const hit = hitTest({ nodes, edges, wx: world.x, wy: world.y, scale: viewport.scale, selectedNodeIds: [] });
      previewRef.current = {
        type: 'edge',
        fromX: drag.startWorldX, fromY: drag.startWorldY,
        toX: world.x, toY: world.y,
        edgeType: (tool === 'line' || tool === 'connector') ? tool : 'connector',
        snapNodeId: hit.type === 'node' ? hit.id : undefined,
      };
      return;
    }

    if (drag.type === 'create-shape') {
      const world = screenToWorld(viewport, sx, sy);
      previewRef.current = {
        type: 'shape',
        fromX: drag.startWorldX, fromY: drag.startWorldY,
        toX: world.x, toY: world.y,
        shapeType: tool as 'rect' | 'ellipse' | 'sticky' | 'text' | 'diamond' | 'parallelogram' | 'cylinder' | 'doc' | 'frame',
      };
      return;
    }

    if (drag.type === 'select-rect') {
      const world = screenToWorld(viewport, sx, sy);
      previewRef.current = {
        type: 'select-rect',
        fromX: drag.startWorldX, fromY: drag.startWorldY,
        toX: world.x, toY: world.y,
      };
    }
  }, [canvasRef, viewport, tool, nodes, edges, selection, dispatch, showGrid, collisionEnabled, physicsRef]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(viewport, sx, sy);
    const drag = dragRef.current;

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
        const selectedIds = nodes
          .filter(n => n.x + n.width >= minX && n.x <= maxX && n.y + n.height >= minY && n.y <= maxY)
          .map(n => n.id);
        dispatch({ type: 'SET_SELECTION', selection: { nodeIds: selectedIds, edgeIds: [] } });
      }
    }

    // パン終了時に慣性速度を算出
    if (drag.type === 'pan') {
      velocityRef.current = computePanInertia(panHistoryRef.current);
      panHistoryRef.current = [];
    }

    dragRef.current = { ...EMPTY_DRAG };
    previewRef.current = { ...EMPTY_PREVIEW };
  }, [canvasRef, viewport, tool, nodes, edges, dispatch, showGrid, isDark, onTextEdit, onToolChange]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    dispatch({ type: 'SET_VIEWPORT', viewport: zoomViewport(viewport, sx, sy, e.deltaY) });
  }, [canvasRef, viewport, dispatch]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const world = getWorldPos(e as unknown as MouseEvent);
    const hit = hitTest({ nodes, edges, wx: world.x, wy: world.y, scale: viewport.scale, selectedNodeIds: selection.nodeIds, selectedEdgeIds: selection.edgeIds });
    if (hit.type === 'node' && hit.id) {
      onTextEdit(hit.id);
      return;
    }
    // ウェイポイントハンドルをダブルクリック → 削除
    if (hit.type === 'waypoint-handle' && hit.id && hit.waypointIndex !== undefined) {
      const edge = edges.find(ed => ed.id === hit.id);
      if (edge?.manualWaypoints) {
        dispatch({ type: 'SNAPSHOT' });
        const newWaypoints = edge.manualWaypoints.filter((_, i) => i !== hit.waypointIndex);
        dispatch({ type: 'UPDATE_EDGE', id: hit.id, changes: { manualWaypoints: newWaypoints.length > 0 ? newWaypoints : undefined } });
      }
      return;
    }
    // エッジ上をダブルクリック → ウェイポイント追加
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
      return;
    }
  }, [getWorldPos, nodes, edges, viewport, selection, onTextEdit, dispatch]);

  const copySelected = useCallback(() => {
    if (selection.nodeIds.length === 0) return;
    const selectedSet = new Set(selection.nodeIds);
    const copiedNodes: GraphNode[] = JSON.parse(JSON.stringify(nodes.filter(n => selectedSet.has(n.id))));
    const copiedEdges: GraphEdge[] = JSON.parse(JSON.stringify(
      edges.filter(edge => selectedSet.has(edge.from.nodeId ?? '') && selectedSet.has(edge.to.nodeId ?? '')),
    ));
    clipboardRef.current = { nodes: copiedNodes, edges: copiedEdges };
    // Also write to system clipboard for cross-tab support
    try {
      const data = JSON.stringify({ type: 'anytime-graph', nodes: copiedNodes, edges: copiedEdges });
      navigator.clipboard.writeText(data).catch(() => {/* ignore clipboard errors */});
    } catch {
      // Clipboard API not available, internal clipboard still works
    }
  }, [selection.nodeIds, nodes, edges]);

  const pasteFromClipboard = useCallback(async () => {
    const doPaste = (sourceNodes: GraphNode[], sourceEdges: GraphEdge[]) => {
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
      // Update source positions for subsequent pastes
      return {
        nodes: sourceNodes.map(n => ({ ...n, x: n.x + 20, y: n.y + 20 })),
        edges: sourceEdges,
      };
    };

    // Try system clipboard first for cross-tab support
    try {
      const text = await navigator.clipboard.readText();
      const parsed = JSON.parse(text);
      if (parsed?.type === 'anytime-graph' && Array.isArray(parsed.nodes)) {
        const updated = doPaste(parsed.nodes, parsed.edges ?? []);
        // Update system clipboard with offset positions for subsequent pastes
        clipboardRef.current = updated;
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

    // Fall back to internal clipboard
    if (!clipboardRef.current) return;
    clipboardRef.current = doPaste(clipboardRef.current.nodes, clipboardRef.current.edges);
  }, [dispatch]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space' && !e.repeat) {
      spaceRef.current = true;
      if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      dispatch({ type: 'SET_SELECTION', selection: { nodeIds: [], edgeIds: [] } });
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && (selection.nodeIds.length > 0 || selection.edgeIds.length > 0)) {
      e.preventDefault();
      // ロック中ノードは削除から除外
      const hasLocked = selection.nodeIds.some(id => nodes.find(n => n.id === id)?.locked);
      if (hasLocked) {
        const unlocked = selection.nodeIds.filter(id => !nodes.find(n => n.id === id)?.locked);
        dispatch({ type: 'SET_SELECTION', selection: { nodeIds: unlocked, edgeIds: selection.edgeIds } });
      }
      dispatch({ type: 'DELETE_SELECTED' });
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); dispatch({ type: 'UNDO' }); onLiveMessage?.('undo'); return; }
      if ((e.key === 'y') || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); dispatch({ type: 'REDO' }); onLiveMessage?.('redo'); return; }
      if (e.key === 'g' && !e.shiftKey) { e.preventDefault(); dispatch({ type: 'GROUP_SELECTED', groupId: crypto.randomUUID() }); return; }
      if (e.key === 'g' && e.shiftKey) { e.preventDefault(); dispatch({ type: 'UNGROUP_SELECTED' }); return; }
      if (e.key === 'a') {
        e.preventDefault();
        dispatch({ type: 'SET_SELECTION', selection: { nodeIds: nodes.map(n => n.id), edgeIds: [] } });
        return;
      }
      if (e.key === 'c') { e.preventDefault(); copySelected(); return; }
      if (e.key === 'v') { e.preventDefault(); pasteFromClipboard(); return; }
    }
  }, [canvasRef, selection, nodes, dispatch, copySelected, pasteFromClipboard, onLiveMessage]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space') {
      spaceRef.current = false;
      if (canvasRef.current) canvasRef.current.style.cursor = 'default';
    }
  }, [canvasRef]);

  useEffect(() => {
    const handleWindowMouseUp = () => {
      if (dragRef.current.type !== 'none') {
        dragRef.current = { ...EMPTY_DRAG };
        previewRef.current = { ...EMPTY_PREVIEW };
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    handleDoubleClick,
    dragRef,
    previewRef,
    clipboardRef,
    hoverNodeIdRef,
    mouseWorldRef,
    cursorRef,
    velocityRef,
    copySelected,
    pasteFromClipboard,
  };
}

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
