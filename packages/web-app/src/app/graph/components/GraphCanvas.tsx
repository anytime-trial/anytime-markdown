'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { GraphNode, GraphEdge, Viewport, SelectionState } from '../types';
import { render, drawSelectionRect, drawEdgePreview, drawShapePreview, drawSnapHighlight, drawSmartGuides } from '../engine/renderer';
import { interpolateViewport } from '@anytime-markdown/graph-core/engine';
import type { ViewportAnimation } from '@anytime-markdown/graph-core/engine';
import { resolveConnectorEndpoints, computeOrthogonalPath } from '../engine/connector';
import type { DragPreview } from '../hooks/useCanvasInteraction';

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  viewport: Viewport;
  selection: SelectionState;
  showGrid: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: (e: React.MouseEvent) => void;
  onWheel: (e: React.WheelEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  previewRef: React.RefObject<DragPreview>;
  hoverNodeIdRef: React.RefObject<string | undefined>;
  mouseWorldRef: React.RefObject<{ x: number; y: number }>;
  viewportAnimRef?: React.RefObject<ViewportAnimation | null>;
  onViewportUpdate?: (viewport: Viewport) => void;
}

export function GraphCanvas({
  nodes, edges, viewport, selection, showGrid, canvasRef,
  onMouseDown, onMouseMove, onMouseUp, onWheel, onDoubleClick, onContextMenu,
  previewRef, hoverNodeIdRef, mouseWorldRef,
  viewportAnimRef, onViewportUpdate,
}: GraphCanvasProps) {
  const rafRef = useRef<number>(0);

  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // アニメーション中なら補間したviewportを使用
    let activeViewport = viewport;
    const anim = viewportAnimRef?.current;
    if (anim) {
      const { viewport: interpolated, done } = interpolateViewport(anim, performance.now());
      activeViewport = interpolated;
      onViewportUpdate?.(interpolated);
      if (done) {
        viewportAnimRef.current = null;
      }
    }

    const resolvedEdges = edges.map(e => {
      if (e.type === 'connector' && e.from.nodeId && e.to.nodeId) {
        const fromNode = nodes.find(n => n.id === e.from.nodeId);
        const toNode = nodes.find(n => n.id === e.to.nodeId);
        if (fromNode && toNode) {
          const waypoints = computeOrthogonalPath(fromNode, toNode, 20, e.manualMidpoint);
          return { ...e, from: { ...e.from, ...waypoints[0] }, to: { ...e.to, ...waypoints[waypoints.length - 1] }, waypoints };
        }
        const pts = resolveConnectorEndpoints(e, nodes);
        return { ...e, from: { ...e.from, ...pts.from }, to: { ...e.to, ...pts.to } };
      }
      if (e.type === 'connector') {
        const pts = resolveConnectorEndpoints(e, nodes);
        return { ...e, from: { ...e.from, ...pts.from }, to: { ...e.to, ...pts.to } };
      }
      return e;
    });

    render(ctx, canvas.width, canvas.height, nodes, resolvedEdges, activeViewport, selection, showGrid, hoverNodeIdRef.current, mouseWorldRef.current.x, mouseWorldRef.current.y);

    // ドラッグプレビュー描画
    const preview = previewRef.current;
    if (preview.type !== 'none') {
      ctx.save();
      ctx.translate(activeViewport.offsetX, activeViewport.offsetY);
      ctx.scale(activeViewport.scale, activeViewport.scale);
      if (preview.type === 'edge' && preview.edgeType) {
        if (preview.snapNodeId) {
          const snapNode = nodes.find(n => n.id === preview.snapNodeId);
          if (snapNode) drawSnapHighlight(ctx, snapNode);
        }
        drawEdgePreview(ctx, preview.fromX, preview.fromY, preview.toX, preview.toY, preview.edgeType);
      } else if (preview.type === 'shape' && preview.shapeType) {
        drawShapePreview(ctx, preview.fromX, preview.fromY, preview.toX, preview.toY, preview.shapeType);
      } else if (preview.type === 'select-rect') {
        const x = Math.min(preview.fromX, preview.toX);
        const y = Math.min(preview.fromY, preview.toY);
        const w = Math.abs(preview.toX - preview.fromX);
        const h = Math.abs(preview.toY - preview.fromY);
        drawSelectionRect(ctx, x, y, w, h);
      }
      ctx.restore();
    }

    // スマートガイド描画
    if (preview.guides && preview.guides.length > 0) {
      ctx.save();
      ctx.translate(activeViewport.offsetX, activeViewport.offsetY);
      ctx.scale(activeViewport.scale, activeViewport.scale);
      drawSmartGuides(ctx, preview.guides);
      ctx.restore();
    }
  }, [canvasRef, nodes, edges, viewport, selection, showGrid, previewRef, hoverNodeIdRef, mouseWorldRef, viewportAnimRef, onViewportUpdate]);

  useEffect(() => {
    const loop = () => {
      renderFrame();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [renderFrame]);

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = parent.clientWidth * dpr;
      canvas.height = parent.clientHeight * dpr;
      canvas.style.width = `${parent.clientWidth}px`;
      canvas.style.height = `${parent.clientHeight}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [canvasRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100%', height: '100%' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    />
  );
}
