import type { GraphDocument, SelectionState, Viewport } from '../../types';
import { render } from '../../engine/index';
import type { Action } from '../../state/index';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useCanvasBase } from '../hooks/useCanvasBase';

interface C4GraphCanvasProps {
  readonly document: GraphDocument;
  readonly viewport: Viewport;
  readonly dispatch: React.Dispatch<Action>;
  readonly canvasRef: React.RefObject<HTMLCanvasElement | null>;
  readonly selectedNodeId?: string | null;
  readonly onNodeSelect?: (nodeId: string | null) => void;
  readonly onNodeDoubleClick?: (nodeId: string) => void;
}

const EMPTY_SELECTION: SelectionState = { nodeIds: [], edgeIds: [] };

export function GraphCanvas({ document, viewport, dispatch, canvasRef, selectedNodeId, onNodeSelect, onNodeDoubleClick }: Readonly<C4GraphCanvasProps>) {
  const rafRef = useRef<number>(0);
  const viewportRef = useRef(viewport);
  const dispatchRef = useRef(dispatch);
  const nodesRef = useRef(document.nodes);
  const [isFocused, setIsFocused] = useState(false);
  viewportRef.current = viewport;
  dispatchRef.current = dispatch;
  nodesRef.current = document.nodes;

  // Selection state
  const selectionRef = useRef<string[]>(selectedNodeId ? [selectedNodeId] : []);
  useEffect(() => {
    selectionRef.current = selectedNodeId ? [selectedNodeId] : [];
  }, [selectedNodeId]);

  // --- useCanvasBase ---
  const canvas = useCanvasBase({
    canvasRef,
    getViewport: () => viewportRef.current,
    getNodes: () => nodesRef.current,
    setViewport: (vp) => dispatchRef.current({ type: 'SET_VIEWPORT', viewport: vp }),
    setSelection: (sel) => {
      selectionRef.current = sel.nodeIds;
      dispatchRef.current({ type: 'SET_SELECTION', selection: sel });
    },
    onNodeClick: (node) => {
      if (node) {
        selectionRef.current = [node.id];
        const c4Id = node.metadata?.c4Id as string | undefined;
        onNodeSelect?.(c4Id ?? node.id);
      } else {
        selectionRef.current = [];
        onNodeSelect?.(null);
      }
    },
    onNodeDoubleClick: (node) => {
      if (node) {
        const c4Id = node.metadata?.c4Id as string | undefined;
        onNodeDoubleClick?.(c4Id ?? node.id);
      }
    },
  });

  // Center on selected node
  useEffect(() => {
    if (!selectedNodeId) return;
    const cvs = canvasRef.current;
    if (!cvs) return;
    const node = document.nodes.find(n => n.id === selectedNodeId);
    if (!node) return;

    const vp = viewportRef.current;
    const centerX = node.x + node.width / 2;
    const centerY = node.y + node.height / 2;
    const canvasCenterX = cvs.clientWidth / 2;
    const canvasCenterY = cvs.clientHeight / 2;

    dispatchRef.current({
      type: 'SET_VIEWPORT',
      viewport: {
        ...vp,
        offsetX: canvasCenterX - centerX * vp.scale,
        offsetY: canvasCenterY - centerY * vp.scale,
      },
    });
  }, [selectedNodeId, document.nodes, canvasRef]);

  // Resolve connector edges to line endpoints
  const resolvedEdges = document.edges.map(e => {
    if (e.type === 'connector' && e.from.nodeId && e.to.nodeId) {
      const fromNode = document.nodes.find(n => n.id === e.from.nodeId);
      const toNode = document.nodes.find(n => n.id === e.to.nodeId);
      if (fromNode && toNode) {
        return {
          ...e,
          type: 'line' as const,
          from: { ...e.from, x: fromNode.x + fromNode.width / 2, y: fromNode.y + fromNode.height / 2 },
          to: { ...e.to, x: toNode.x + toNode.width / 2, y: toNode.y + toNode.height / 2 },
        };
      }
    }
    return e;
  });

  // Render loop
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    function draw() {
      const w = cvs!.clientWidth;
      const h = cvs!.clientHeight;
      const dpr = globalThis.devicePixelRatio ?? 1;
      cvs!.width = w * dpr;
      cvs!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const sel = selectionRef.current;
      render({
        ctx: ctx!,
        width: w,
        height: h,
        nodes: document.nodes,
        edges: resolvedEdges,
        viewport: viewportRef.current,
        selection: sel.length > 0 ? { nodeIds: sel, edgeIds: [] } : EMPTY_SELECTION,
        showGrid: false,
        isDark: true,
      });

      // Selection rectangle overlay
      canvas.drawSelectOverlay(ctx!, viewportRef.current);

      rafRef.current = requestAnimationFrame(draw);
    }
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [document.nodes, resolvedEdges, canvasRef, canvas]);

  const getCursor = useCallback(() => {
    const mode = canvas.getDragMode();
    if (mode === 'select-rect') return 'crosshair';
    if (mode === 'pan') return 'grabbing';
    return 'default';
  }, [canvas]);

  return (
    <canvas
      ref={canvasRef}
      tabIndex={0}
      role="img"
      aria-roledescription="architecture diagram"
      aria-label={`C4 architecture graph with ${document.nodes.length} nodes`}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        cursor: getCursor(),
        outline: 'none',
        boxShadow: isFocused ? 'inset 0 0 0 2px #4FC3F7' : 'none',
      }}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onKeyDown={canvas.handleKeyDown}
      onMouseDown={canvas.handleMouseDown}
      onMouseMove={canvas.handleMouseMove}
      onMouseUp={canvas.handleMouseUp}
      onMouseLeave={canvas.handleMouseUp}
      onDoubleClick={canvas.handleDoubleClick}
      onContextMenu={canvas.handleContextMenu}
    />
  );
}
