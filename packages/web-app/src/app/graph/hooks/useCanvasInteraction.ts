'use client';

import { useCallback, useRef, useEffect } from 'react';
import { ToolType, GraphNode, GraphEdge, Viewport, SelectionState, createNode, createEdge } from '../types';
import { screenToWorld } from '../engine/viewport';
import { hitTest, HitResult, ResizeHandle } from '../engine/hitTest';
import { pan as panViewport, zoom as zoomViewport } from '../engine/viewport';

interface DragState {
  type: 'none' | 'pan' | 'move' | 'resize' | 'create-shape' | 'select-rect' | 'create-edge';
  startWorldX: number;
  startWorldY: number;
  startScreenX: number;
  startScreenY: number;
  handle?: ResizeHandle;
  nodeId?: string;
  initialNodes?: Map<string, { x: number; y: number; width: number; height: number }>;
}

interface UseCanvasInteractionProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  tool: ToolType;
  nodes: GraphNode[];
  edges: GraphEdge[];
  viewport: Viewport;
  selection: SelectionState;
  dispatch: React.Dispatch<any>;
  onTextEdit: (nodeId: string) => void;
}

export function useCanvasInteraction({
  canvasRef, tool, nodes, edges, viewport, selection, dispatch, onTextEdit,
}: UseCanvasInteractionProps) {
  const dragRef = useRef<DragState>({
    type: 'none', startWorldX: 0, startWorldY: 0, startScreenX: 0, startScreenY: 0,
  });
  const spaceRef = useRef(false);

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
      const hit = hitTest(nodes, edges, world.x, world.y, viewport.scale, selection.nodeIds);

      if (hit.type === 'resize-handle' && hit.id && hit.handle) {
        const node = nodes.find(n => n.id === hit.id)!;
        dragRef.current = {
          type: 'resize', startWorldX: world.x, startWorldY: world.y,
          startScreenX: sx, startScreenY: sy, handle: hit.handle, nodeId: hit.id,
          initialNodes: new Map([[node.id, { x: node.x, y: node.y, width: node.width, height: node.height }]]),
        };
        dispatch({ type: 'SNAPSHOT' });
        return;
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
        dispatch({ type: 'SET_SELECTION', selection: { nodeIds: selectedIds, edgeIds: [] } });
        const initialNodes = new Map<string, { x: number; y: number; width: number; height: number }>();
        selectedIds.forEach(id => {
          const n = nodes.find(nd => nd.id === id);
          if (n) initialNodes.set(id, { x: n.x, y: n.y, width: n.width, height: n.height });
        });
        dragRef.current = {
          type: 'move', startWorldX: world.x, startWorldY: world.y,
          startScreenX: sx, startScreenY: sy, initialNodes,
        };
        dispatch({ type: 'SNAPSHOT' });
        return;
      }

      if (hit.type === 'edge' && hit.id) {
        dispatch({ type: 'SET_SELECTION', selection: { nodeIds: [], edgeIds: [hit.id] } });
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

    if (['rect', 'ellipse', 'sticky', 'text'].includes(tool)) {
      dragRef.current = {
        type: 'create-shape', startWorldX: world.x, startWorldY: world.y,
        startScreenX: sx, startScreenY: sy,
      };
      return;
    }

    if (['line', 'arrow', 'connector'].includes(tool)) {
      const hit = hitTest(nodes, edges, world.x, world.y, viewport.scale, []);
      dragRef.current = {
        type: 'create-edge', startWorldX: world.x, startWorldY: world.y,
        startScreenX: sx, startScreenY: sy,
        nodeId: hit.type === 'node' ? hit.id : undefined,
      };
      return;
    }
  }, [canvasRef, viewport, tool, nodes, edges, selection, dispatch]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const drag = dragRef.current;

    if (drag.type === 'pan') {
      const dx = sx - drag.startScreenX;
      const dy = sy - drag.startScreenY;
      dispatch({ type: 'SET_VIEWPORT', viewport: panViewport(viewport, dx, dy) });
      dragRef.current = { ...drag, startScreenX: sx, startScreenY: sy };
      return;
    }

    if (drag.type === 'move' && drag.initialNodes) {
      const world = screenToWorld(viewport, sx, sy);
      const dx = world.x - drag.startWorldX;
      const dy = world.y - drag.startWorldY;
      const ids = [...drag.initialNodes.keys()];
      ids.forEach(id => {
        const init = drag.initialNodes!.get(id)!;
        dispatch({ type: 'RESIZE_NODE', id, x: init.x + dx, y: init.y + dy, width: init.width, height: init.height });
      });
      return;
    }

    if (drag.type === 'resize' && drag.nodeId && drag.handle && drag.initialNodes) {
      const world = screenToWorld(viewport, sx, sy);
      const init = drag.initialNodes.get(drag.nodeId)!;
      const { x, y, width, height } = computeResize(init, drag.handle, world.x, world.y, drag.startWorldX, drag.startWorldY);
      dispatch({ type: 'RESIZE_NODE', id: drag.nodeId, x, y, width, height });
      return;
    }
  }, [canvasRef, viewport, dispatch]);

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
      const x = Math.min(world.x, drag.startWorldX);
      const y = Math.min(world.y, drag.startWorldY);
      const nodeType = tool as 'rect' | 'ellipse' | 'sticky' | 'text';
      const node = createNode(nodeType, x, y, {
        width: Math.max(w, 80),
        height: Math.max(h, nodeType === 'text' ? 30 : 50),
      });
      dispatch({ type: 'ADD_NODE', node });
    }

    if (drag.type === 'create-edge') {
      const hit = hitTest(nodes, edges, world.x, world.y, viewport.scale, []);
      const edgeType = tool as 'line' | 'arrow' | 'connector';
      const edge = createEdge(
        edgeType,
        { nodeId: drag.nodeId, x: drag.startWorldX, y: drag.startWorldY },
        { nodeId: hit.type === 'node' ? hit.id : undefined, x: world.x, y: world.y },
      );
      if (Math.hypot(world.x - drag.startWorldX, world.y - drag.startWorldY) > 5) {
        dispatch({ type: 'ADD_EDGE', edge });
      }
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

    dragRef.current = { type: 'none', startWorldX: 0, startWorldY: 0, startScreenX: 0, startScreenY: 0 };
  }, [canvasRef, viewport, tool, nodes, edges, dispatch]);

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
    const hit = hitTest(nodes, edges, world.x, world.y, viewport.scale, selection.nodeIds);
    if (hit.type === 'node' && hit.id) {
      onTextEdit(hit.id);
    }
  }, [getWorldPos, nodes, edges, viewport, selection, onTextEdit]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space' && !e.repeat) {
      spaceRef.current = true;
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && (selection.nodeIds.length > 0 || selection.edgeIds.length > 0)) {
      e.preventDefault();
      dispatch({ type: 'DELETE_SELECTED' });
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); dispatch({ type: 'UNDO' }); return; }
      if ((e.key === 'y') || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); dispatch({ type: 'REDO' }); return; }
      if (e.key === 'g' && !e.shiftKey) { e.preventDefault(); dispatch({ type: 'GROUP_SELECTED', groupId: crypto.randomUUID() }); return; }
      if (e.key === 'g' && e.shiftKey) { e.preventDefault(); dispatch({ type: 'UNGROUP_SELECTED' }); return; }
    }
  }, [selection, dispatch]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space') spaceRef.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    handleDoubleClick,
    dragRef,
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
