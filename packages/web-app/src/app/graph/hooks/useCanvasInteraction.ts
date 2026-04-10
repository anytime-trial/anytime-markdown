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

      // フレーム折りたたみアイコン
      if (hit.type === 'frame-collapse' && hit.id) {
        const frameNode = nodes.find(n => n.id === hit.id);
        if (frameNode) {
          dispatch({ type: 'UPDATE_NODE', id: hit.id, changes: { collapsed: !(frameNode.collapsed ?? false) } });
        }
        return;
      }

      // エッジエンドポイントハンドル → 端点再接続ドラッグ
      if (hit.type === 'edge-endpoint' && hit.id && hit.endpointEnd) {
        const edge = edges.find(ed => ed.id === hit.id);
        if (edge) {
          const endpoint = hit.endpointEnd === 'from' ? edge.from : edge.to;
          dispatch({ type: 'SNAPSHOT' });
          dragRef.current = {
            type: 'create-edge', startWorldX: endpoint.x, startWorldY: endpoint.y,
            startScreenX: sx, startScreenY: sy,
            edgeId: hit.id, endpointEnd: hit.endpointEnd,
            // 反対側のnodeIdを保持
            nodeId: hit.endpointEnd === 'from' ? edge.to.nodeId : edge.from.nodeId,
          };
        }
        return;
      }

      // 接続ポイントクリック → コネクタ作成開始（辺上の任意位置対応）
      if (hit.type === 'connection-point' && hit.id) {
        const cpX = hit.connectionX ?? world.x;
        const cpY = hit.connectionY ?? world.y;
        dragRef.current = {
          type: 'create-edge', startWorldX: cpX, startWorldY: cpY,
          startScreenX: sx, startScreenY: sy, nodeId: hit.id,
          fromConnectionPoint: true,
        };
        return;
      }

      if (hit.type === 'resize-handle' && hit.id && hit.handle) {
        const node = nodes.find(n => n.id === hit.id);
        if (!node || node.locked) return;
        dragRef.current = {
          type: 'resize', startWorldX: world.x, startWorldY: world.y,
          startScreenX: sx, startScreenY: sy, handle: hit.handle, nodeId: hit.id,
          initialNodes: new Map([[node.id, { x: node.x, y: node.y, width: node.width, height: node.height }]]),
        };
        dispatch({ type: 'SNAPSHOT' });
        return;
      }

      // Ctrl+クリック（またはCmd+クリック）でURLを開く
      if ((e.ctrlKey || e.metaKey) && hit.type === 'node' && hit.id) {
        const node = nodes.find(n => n.id === hit.id);
        if (node?.url) {
          window.open(node.url, '_blank', 'noopener,noreferrer');
          return;
        }
      }

      if (hit.type === 'node' && hit.id) {
        const isSelected = selection.nodeIds.includes(hit.id);
        let selectedIds: string[];
        if (e.shiftKey) {
          selectedIds = isSelected
            ? selection.nodeIds.filter(id => id !== hit.id)
            : [...selection.nodeIds, hit.id];
        } else {
          selectedIds = isSelected ? selection.nodeIds : [hit.id];
        }
        const groupIds = new Set(nodes.filter(n => selectedIds.includes(n.id) && n.groupId).map(n => n.groupId));
        if (groupIds.size > 0) {
          nodes.forEach(n => { if (n.groupId && groupIds.has(n.groupId)) selectedIds.push(n.id); });
          selectedIds = [...new Set(selectedIds)];
        }
        // フレーム選択時: 内部ノードも移動対象に含める
        const frameNodes = nodes.filter(n => selectedIds.includes(n.id) && n.type === 'frame');
        for (const frame of frameNodes) {
          nodes.forEach(n => {
            if (n.id !== frame.id && n.type !== 'frame' &&
                n.x >= frame.x && n.y >= frame.y &&
                n.x + n.width <= frame.x + frame.width &&
                n.y + n.height <= frame.y + frame.height) {
              selectedIds.push(n.id);
            }
          });
        }
        selectedIds = [...new Set(selectedIds)];
        dispatch({ type: 'SET_SELECTION', selection: { nodeIds: selectedIds, edgeIds: [] } });
        // ロック中ノードが含まれる場合は移動しない
        const hitNode = nodes.find(n => n.id === hit.id);
        if (hitNode?.locked) return;
        const initialNodes = new Map<string, { x: number; y: number; width: number; height: number }>();
        selectedIds.forEach(id => {
          const n = nodes.find(nd => nd.id === id);
          if (n && !n.locked) initialNodes.set(id, { x: n.x, y: n.y, width: n.width, height: n.height });
        });
        dragRef.current = {
          type: 'move', startWorldX: world.x, startWorldY: world.y,
          startScreenX: sx, startScreenY: sy, initialNodes,
        };
        if (physicsRef?.current) {
          physicsRef.current.syncFromNodes(nodes);
        }
        dispatch({ type: 'SNAPSHOT' });
        return;
      }

      if (hit.type === 'waypoint-handle' && hit.id && hit.waypointIndex !== undefined) {
        const edge = edges.find(ed => ed.id === hit.id);
        dispatch({ type: 'SET_SELECTION', selection: { nodeIds: [], edgeIds: [hit.id] } });
        dispatch({ type: 'SNAPSHOT' });
        dragRef.current = {
          type: 'move-waypoint', startWorldX: world.x, startWorldY: world.y,
          startScreenX: sx, startScreenY: sy,
          edgeId: hit.id, waypointIndex: hit.waypointIndex,
          initialWaypoints: edge?.manualWaypoints ? [...edge.manualWaypoints.map(w => ({ ...w }))] : [],
        };
        return;
      }

      if (hit.type === 'edge-segment' && hit.id && hit.segmentDirection) {
        const edge = edges.find(ed => ed.id === hit.id);
        dispatch({ type: 'SET_SELECTION', selection: { nodeIds: [], edgeIds: [hit.id] } });
        dispatch({ type: 'SNAPSHOT' });
        dragRef.current = {
          type: 'move-edge-segment', startWorldX: world.x, startWorldY: world.y,
          startScreenX: sx, startScreenY: sy,
          edgeId: hit.id, segmentDirection: hit.segmentDirection,
          segmentIndex: hit.segmentIndex,
          initialMidpoint: edge?.manualMidpoint,
          initialWaypoints: edge?.manualWaypoints ? [...edge.manualWaypoints.map(w => ({ ...w }))] : undefined,
        };
        return;
      }

      if (hit.type === 'edge' && hit.id) {
        // 既に選択中のエッジと重なる場合、次のエッジにサイクル
        let targetId = hit.id;
        if (selection.edgeIds.includes(hit.id)) {
          const overlapping = resolved.filter(
            ed => ed.id !== hit.id && hitTestEdge(ed, world.x, world.y, viewport.scale),
          );
          if (overlapping.length > 0) targetId = overlapping[0].id;
        }
        dispatch({ type: 'SET_SELECTION', selection: { nodeIds: [], edgeIds: [targetId] } });
        return;
      }

      if (!e.shiftKey) {
        dispatch({ type: 'SET_SELECTION', selection: { nodeIds: [], edgeIds: [] } });
      }
      dragRef.current = {
        type: 'select-rect', startWorldX: world.x, startWorldY: world.y,
        startScreenX: sx, startScreenY: sy,
      };
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
      // ノード上からの開始: 境界の最近点を使用
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
      // ホバー判定はリサイズハンドルを無視
      const hoverHit = hitTest({ nodes, edges: resolved, wx: world.x, wy: world.y, scale: viewport.scale, selectedNodeIds: [] });
      hoverNodeIdRef.current = hoverHit.type === 'node' ? hoverHit.id : undefined;

      // カーソル設定
      const RESIZE_CURSORS: Record<string, string> = {
        nw: 'nwse-resize', se: 'nwse-resize',
        ne: 'nesw-resize', sw: 'nesw-resize',
        n: 'ns-resize', s: 'ns-resize',
        e: 'ew-resize', w: 'ew-resize',
      };
      if (fullHit.type === 'frame-collapse') {
        cursorRef.current = 'pointer';
      } else if (fullHit.type === 'resize-handle' && fullHit.handle) {
        cursorRef.current = RESIZE_CURSORS[fullHit.handle] ?? 'default';
      } else if (fullHit.type === 'edge-endpoint') {
        cursorRef.current = 'crosshair';
      } else if (fullHit.type === 'connection-point') {
        cursorRef.current = 'crosshair';
      } else if (fullHit.type === 'edge-segment') {
        cursorRef.current = fullHit.segmentDirection === 'vertical' ? 'ew-resize' : 'ns-resize';
      } else if (fullHit.type === 'node') {
        const hitNode = nodes.find(n => n.id === fullHit.id);
        if ((e.ctrlKey || e.metaKey) && hitNode?.url) {
          cursorRef.current = 'pointer';
        } else {
          cursorRef.current = 'move';
        }
      } else if (fullHit.type === 'edge') {
        cursorRef.current = 'pointer';
      } else {
        cursorRef.current = 'default';
      }
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
        // Smart guides: snap to other nodes when grid is off
        // Compute bounding box of all dragged nodes (works for single and multi-node)
        const draggedInits = ids.flatMap(id => { const init = initNodes.get(id); return init ? [{ id, init }] : []; });
        const bboxX = Math.min(...draggedInits.map(d => d.init.x + dx));
        const bboxY = Math.min(...draggedInits.map(d => d.init.y + dy));
        const bboxRight = Math.max(...draggedInits.map(d => d.init.x + dx + d.init.width));
        const bboxBottom = Math.max(...draggedInits.map(d => d.init.y + dy + d.init.height));
        const bboxWidth = bboxRight - bboxX;
        const bboxHeight = bboxBottom - bboxY;

        const otherRects = nodes
          .filter(n => !initNodes.has(n.id))
          .map(n => ({ id: n.id, x: n.x, y: n.y, width: n.width, height: n.height }));
        const result = computeSmartGuides(bboxX, bboxY, bboxWidth, bboxHeight, otherRects, 5);

        // Apply snap offset uniformly to all dragged nodes
        const snapDx = result.snappedX - bboxX;
        const snapDy = result.snappedY - bboxY;
        const snapUpdates = ids.flatMap(id => {
          const init = initNodes.get(id);
          return init ? [{ id, x: init.x + dx + snapDx, y: init.y + dy + snapDy }] : [];
        });
        dispatch({ type: 'SET_NODE_POSITIONS', updates: snapUpdates });
        if (collisionEnabled && physicsRef?.current) {
          for (const u of snapUpdates) {
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
        previewRef.current = { type: 'none', fromX: 0, fromY: 0, toX: 0, toY: 0, guides: result.guides };
      } else {
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
        if (collisionEnabled && physicsRef?.current) {
          for (const u of moveUpdates) {
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
      // manualWaypoints がある場合: 該当セグメント端点を平行移動
      if (drag.initialWaypoints?.length && drag.segmentIndex !== undefined) {
        const newWaypoints = drag.initialWaypoints.map(w => ({ ...w }));
        const delta = drag.segmentDirection === 'horizontal'
          ? world.y - drag.startWorldY
          : world.x - drag.startWorldX;
        // segmentIndex は waypoints（fromPt + manualWaypoints + toPt）内のインデックス
        // manualWaypoints のインデックスは segmentIndex - 1 と segmentIndex
        const mwpIdx1 = drag.segmentIndex - 1;
        const mwpIdx2 = drag.segmentIndex;
        if (drag.segmentDirection === 'horizontal') {
          if (mwpIdx1 >= 0 && mwpIdx1 < newWaypoints.length) newWaypoints[mwpIdx1].y += delta;
          if (mwpIdx2 >= 0 && mwpIdx2 < newWaypoints.length) newWaypoints[mwpIdx2].y += delta;
        } else {
          if (mwpIdx1 >= 0 && mwpIdx1 < newWaypoints.length) newWaypoints[mwpIdx1].x += delta;
          if (mwpIdx2 >= 0 && mwpIdx2 < newWaypoints.length) newWaypoints[mwpIdx2].x += delta;
        }
        dispatch({ type: 'UPDATE_EDGE', id: drag.edgeId, changes: { manualWaypoints: newWaypoints } });
        return;
      }
      // 従来の manualMidpoint ドラッグ
      const newMidpoint = drag.segmentDirection === 'vertical' ? world.x : world.y;
      dispatch({ type: 'UPDATE_EDGE', id: drag.edgeId, changes: { manualMidpoint: newMidpoint } });
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
      const nodeType = tool as 'rect' | 'ellipse' | 'sticky' | 'text' | 'diamond' | 'parallelogram' | 'cylinder' | 'doc' | 'frame';
      const node = createNode(nodeType, x, y, { width: fw, height: fh }, isDark);
      dispatch({ type: 'ADD_NODE', node });
      onToolChange('select');
    }

    if (drag.type === 'create-edge') {
      const hit = hitTest({ nodes, edges, wx: world.x, wy: world.y, scale: viewport.scale, selectedNodeIds: [] });
      const edgeType: 'line' | 'connector' =
        (tool === 'line' || tool === 'connector') ? tool : 'connector';
      const dist = Math.hypot(world.x - drag.startWorldX, world.y - drag.startWorldY);

      // エッジエンドポイント再接続（既存エッジの端点変更）
      if (drag.edgeId && drag.endpointEnd) {
        const targetNodeId = hit.type === 'node' ? hit.id : undefined;
        if (drag.endpointEnd === 'from') {
          dispatch({ type: 'UPDATE_EDGE', id: drag.edgeId, changes: {
            from: { nodeId: targetNodeId, x: world.x, y: world.y },
            to: { nodeId: drag.nodeId, x: drag.startWorldX, y: drag.startWorldY },
            manualMidpoint: undefined,
          } });
        } else {
          dispatch({ type: 'UPDATE_EDGE', id: drag.edgeId, changes: {
            from: { nodeId: drag.nodeId, x: drag.startWorldX, y: drag.startWorldY },
            to: { nodeId: targetNodeId, x: world.x, y: world.y },
            manualMidpoint: undefined,
          } });
        }
      } else if (dist > 5) {
        if (hit.type === 'node' && hit.id) {
          // 既存ノードに接続（ノード境界の最近点を使用）
          const targetNode = nodes.find(n => n.id === hit.id);
          const bp = targetNode ? nearestBorderPoint(targetNode, world.x, world.y) : null;
          const toX = bp?.x ?? world.x;
          const toY = bp?.y ?? world.y;
          const edge = createEdge(
            edgeType,
            { nodeId: drag.nodeId, x: drag.startWorldX, y: drag.startWorldY },
            { nodeId: hit.id, x: toX, y: toY },
            undefined, isDark,
          );
          dispatch({ type: 'ADD_EDGE', edge });
        } else if (!drag.fromConnectionPoint && (tool === 'line' || tool === 'connector')) {
          // 線ツールで空白→空白: フリーなエッジを作成
          const edge = createEdge(
            edgeType,
            { nodeId: drag.nodeId, x: drag.startWorldX, y: drag.startWorldY },
            { x: world.x, y: world.y },
            undefined, isDark,
          );
          dispatch({ type: 'ADD_EDGE', edge });
        } else if (drag.fromConnectionPoint) {
          // 接続ポイント起点 + 空白にドロップ → 子ノード自動作成 + コネクタ接続
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
            width: childW,
            height: childH,
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
      }
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
      const history = panHistoryRef.current;
      if (history.length >= 2) {
        const first = history[0];
        const last = history.at(-1);
        if (first && last) {
          const dt = last.t - first.t;
          if (dt > 0 && dt < 100) {
            velocityRef.current = {
              vx: (last.x - first.x) / dt * 16,
              vy: (last.y - first.y) / dt * 16,
            };
          }
        }
      }
      panHistoryRef.current = [];
    }

    dragRef.current = { type: 'none', startWorldX: 0, startWorldY: 0, startScreenX: 0, startScreenY: 0 };
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
        // ウェイポイント配列内の適切な位置に挿入（パスに沿った順序を維持）
        const wp = { x: world.x, y: world.y };
        if (existing.length === 0 || !edge.waypoints?.length) {
          dispatch({ type: 'UPDATE_EDGE', id: hit.id, changes: { manualWaypoints: [...existing, wp] } });
        } else {
          // waypoints パス上で最も近いセグメントの後に挿入
          let bestIdx = existing.length;
          let bestDist = Infinity;
          const fullPath = edge.waypoints;
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
              // i は fullPath のインデックス。manualWaypoints のインデックスは i - 1（fromPt を除く）
              bestIdx = Math.max(0, Math.min(existing.length, i));
            }
          }
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
        dragRef.current = { type: 'none', startWorldX: 0, startWorldY: 0, startScreenX: 0, startScreenY: 0 };
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
