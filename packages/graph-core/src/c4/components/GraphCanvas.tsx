import type { GraphDocument, SelectionState, Viewport } from '../../types';
import { render, pan, zoom } from '../../engine/index';
import type { Action } from '../../state/index';
import { useCallback, useEffect, useRef, useState } from 'react';

interface C4GraphCanvasProps {
  readonly document: GraphDocument;
  readonly viewport: Viewport;
  readonly dispatch: React.Dispatch<Action>;
  readonly canvasRef: React.RefObject<HTMLCanvasElement | null>;
  readonly selectedNodeId?: string | null;
}

const EMPTY_SELECTION: SelectionState = { nodeIds: [], edgeIds: [] };
const PAN_STEP = 20;

export function GraphCanvas({ document, viewport, dispatch, canvasRef, selectedNodeId }: Readonly<C4GraphCanvasProps>) {
  const rafRef = useRef<number>(0);
  const isPanningRef = useRef(false);
  const lastPanRef = useRef({ x: 0, y: 0 });
  const viewportRef = useRef(viewport);
  const dispatchRef = useRef(dispatch);
  const [isFocused, setIsFocused] = useState(false);
  viewportRef.current = viewport;
  dispatchRef.current = dispatch;

  // Center on selected node
  useEffect(() => {
    if (!selectedNodeId) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const node = document.nodes.find(n => n.id === selectedNodeId);
    if (!node) return;

    const vp = viewportRef.current;
    const centerX = node.x + node.width / 2;
    const centerY = node.y + node.height / 2;
    const canvasCenterX = canvas.clientWidth / 2;
    const canvasCenterY = canvas.clientHeight / 2;

    dispatchRef.current({
      type: 'SET_VIEWPORT',
      viewport: {
        ...vp,
        offsetX: canvasCenterX - centerX * vp.scale,
        offsetY: canvasCenterY - centerY * vp.scale,
      },
    });
  }, [selectedNodeId, document.nodes, canvasRef]);

  // Resolve connector edges to line endpoints (simple center-to-center)
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cvs = canvas;
    const context = ctx;

    function draw() {
      const w = cvs.clientWidth;
      const h = cvs.clientHeight;
      const dpr = globalThis.devicePixelRatio ?? 1;
      cvs.width = w * dpr;
      cvs.height = h * dpr;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      render({
        ctx: context,
        width: w,
        height: h,
        nodes: document.nodes,
        edges: resolvedEdges,
        viewport: viewportRef.current,
        selection: selectedNodeId ? { nodeIds: [selectedNodeId], edgeIds: [] } : EMPTY_SELECTION,
        showGrid: false,
        isDark: true,
      });

      rafRef.current = requestAnimationFrame(draw);
    }
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [document.nodes, resolvedEdges, canvasRef, selectedNodeId]);

  // Pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0 || e.button === 1) {
      isPanningRef.current = true;
      lastPanRef.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanningRef.current) return;
    const dx = e.clientX - lastPanRef.current.x;
    const dy = e.clientY - lastPanRef.current.y;
    lastPanRef.current = { x: e.clientX, y: e.clientY };
    const newViewport = pan(viewportRef.current, dx, dy);
    dispatchRef.current({ type: 'SET_VIEWPORT', viewport: newViewport });
  }, []);

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const vp = viewportRef.current;
    switch (e.key) {
      case 'ArrowUp': {
        e.preventDefault();
        const newViewport = pan(vp, 0, PAN_STEP);
        dispatchRef.current({ type: 'SET_VIEWPORT', viewport: newViewport });
        break;
      }
      case 'ArrowDown': {
        e.preventDefault();
        const newViewport = pan(vp, 0, -PAN_STEP);
        dispatchRef.current({ type: 'SET_VIEWPORT', viewport: newViewport });
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        const newViewport = pan(vp, PAN_STEP, 0);
        dispatchRef.current({ type: 'SET_VIEWPORT', viewport: newViewport });
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        const newViewport = pan(vp, -PAN_STEP, 0);
        dispatchRef.current({ type: 'SET_VIEWPORT', viewport: newViewport });
        break;
      }
      case '+':
      case '=': {
        e.preventDefault();
        dispatchRef.current({ type: 'SET_VIEWPORT', viewport: { ...vp, scale: vp.scale * 1.1 } });
        break;
      }
      case '-': {
        e.preventDefault();
        dispatchRef.current({ type: 'SET_VIEWPORT', viewport: { ...vp, scale: vp.scale * 0.9 } });
        break;
      }
    }
  }, []);

  // Zoom (non-passive listener, registered once)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const newViewport = zoom(viewportRef.current, cx, cy, e.deltaY);
      dispatchRef.current({ type: 'SET_VIEWPORT', viewport: newViewport });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [canvasRef]);

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
        cursor: 'grab',
        outline: 'none',
        boxShadow: isFocused ? 'inset 0 0 0 2px #4FC3F7' : 'none',
      }}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onKeyDown={handleKeyDown}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  );
}
