'use client';

import { useRef, useEffect, useCallback } from 'react';
import type { GraphDocument, Viewport, SelectionState } from '@anytime-markdown/graph-core';
import { engine } from '@anytime-markdown/graph-core';
import type { Action } from '@anytime-markdown/graph-core/state';

const { render, pan, zoom } = engine;

interface C4GraphCanvasProps {
  readonly document: GraphDocument;
  readonly viewport: Viewport;
  readonly dispatch: React.Dispatch<Action>;
  readonly canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

const EMPTY_SELECTION: SelectionState = { nodeIds: [], edgeIds: [] };

export function GraphCanvas({ document, viewport, dispatch, canvasRef }: Readonly<C4GraphCanvasProps>) {
  const rafRef = useRef<number>(0);
  const isPanningRef = useRef(false);
  const lastPanRef = useRef({ x: 0, y: 0 });
  const viewportRef = useRef(viewport);
  const dispatchRef = useRef(dispatch);
  viewportRef.current = viewport;
  dispatchRef.current = dispatch;

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

    function draw() {
      const w = canvas!.clientWidth;
      const h = canvas!.clientHeight;
      const dpr = globalThis.devicePixelRatio ?? 1;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      render({
        ctx: ctx!,
        width: w,
        height: h,
        nodes: document.nodes,
        edges: resolvedEdges,
        viewport: viewportRef.current,
        selection: EMPTY_SELECTION,
        showGrid: false,
        isDark: true,
      });

      rafRef.current = requestAnimationFrame(draw);
    }
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [document.nodes, resolvedEdges, canvasRef]);

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
      style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  );
}
