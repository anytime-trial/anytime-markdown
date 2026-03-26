import { useRef, useEffect, useCallback } from 'react';
import type { GraphNode, GraphEdge, Viewport, SelectionState } from '@anytime-markdown/graph-core';
import {
  render, drawEdgePreview, drawShapePreview, drawSelectionRect,
  drawSnapHighlight, drawSmartGuides, resolveConnectorEndpoints,
} from '@anytime-markdown/graph-core/engine';
import type { DragPreview } from '../hooks/useCanvasInteraction';

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  viewport: Viewport;
  selection: SelectionState;
  showGrid: boolean;
  previewRef: React.RefObject<DragPreview>;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: (e: React.MouseEvent) => void;
  onWheel: (e: React.WheelEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
}

export function GraphCanvas({
  nodes, edges, viewport, selection, showGrid,
  previewRef, onMouseDown, onMouseMove, onMouseUp, onWheel, onDoubleClick,
}: GraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Resolve connector endpoints
    const resolvedEdges = edges.map(e => {
      if (e.type === 'connector' && (e.from.nodeId || e.to.nodeId)) {
        const pts = resolveConnectorEndpoints(e, nodes);
        return { ...e, from: { ...e.from, ...pts.from }, to: { ...e.to, ...pts.to } };
      }
      return e;
    });

    render({ ctx, width: w, height: h, nodes, edges: resolvedEdges, viewport, selection, showGrid });

    // Draw previews
    const preview = previewRef.current;
    if (preview) {
      ctx.save();
      ctx.translate(viewport.offsetX, viewport.offsetY);
      ctx.scale(viewport.scale, viewport.scale);

      if (preview.guides && preview.guides.length > 0) {
        drawSmartGuides(ctx, preview.guides);
      }
      if (preview.type === 'edge' && preview.edgeType) {
        drawEdgePreview(ctx, preview.fromX, preview.fromY, preview.toX, preview.toY, preview.edgeType);
        if (preview.snapNodeId) {
          const snapNode = nodes.find(n => n.id === preview.snapNodeId);
          if (snapNode) drawSnapHighlight(ctx, snapNode);
        }
      }
      if (preview.type === 'shape' && preview.shapeType) {
        drawShapePreview(ctx, preview.fromX, preview.fromY, preview.toX, preview.toY, preview.shapeType);
      }
      if (preview.type === 'select-rect') {
        const rx = Math.min(preview.fromX, preview.toX);
        const ry = Math.min(preview.fromY, preview.toY);
        const rw = Math.abs(preview.toX - preview.fromX);
        const rh = Math.abs(preview.toY - preview.fromY);
        drawSelectionRect(ctx, rx, ry, rw, rh);
      }

      ctx.restore();
    }
  }, [nodes, edges, viewport, selection, showGrid, previewRef]);

  useEffect(() => {
    let animId: number;
    const loop = () => {
      renderFrame();
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [renderFrame]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block', cursor: 'default' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
    />
  );
}

