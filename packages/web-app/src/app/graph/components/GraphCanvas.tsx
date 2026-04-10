'use client';

import { getCanvasColors } from '@anytime-markdown/graph-core';
import type { ViewportAnimation } from '@anytime-markdown/graph-core/engine';
import type { Side } from '@anytime-markdown/graph-core/engine';
import { computeVisibilityPath,drawEdgePreview, drawSelectionRect, drawShapePreview, drawSmartGuides, drawSnapHighlight, interpolateViewport, render } from '@anytime-markdown/graph-core/engine';
import React, { useCallback, useEffect, useMemo,useRef } from 'react';

import { bestSides, computeBezierPath, computeOrthogonalPath, getConnectionPoints, resolveConnectorEndpoints } from '@anytime-markdown/graph-core/engine';
import type { DragPreview } from '../hooks/useCanvasInteraction';
import { GraphEdge, GraphNode, SelectionState,Viewport } from '../types';

/** 制御点を接続辺に垂直な方向にオフセットする（カーブ方向の変更） */
function deflectControlPoint(
  cp: { x: number; y: number },
  side: Side,
  amount: number,
): { x: number; y: number } {
  // 辺に垂直な方向にオフセット
  if (side === 'left' || side === 'right') {
    return { x: cp.x, y: cp.y + amount };
  }
  return { x: cp.x + amount, y: cp.y };
}

/** 接続ポイントを辺に沿った方向にオフセットする */
function offsetAlongSide(
  pt: { side: Side; x: number; y: number },
  side: Side,
  offset: number,
): { side: Side; x: number; y: number } {
  if (side === 'left' || side === 'right') {
    return { ...pt, y: pt.y + offset };
  }
  return { ...pt, x: pt.x + offset };
}

interface GraphCanvasProps {
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
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
  onDropImage?: (dataUrl: string, x: number, y: number, width: number, height: number) => void;
  viewportAnimRef?: React.RefObject<ViewportAnimation | null>;
  onViewportUpdate?: (viewport: Viewport) => void;
  velocityRef?: React.RefObject<{ vx: number; vy: number }>;
  onPanInertia?: (dx: number, dy: number) => void;
  draggingNodeIds?: string[];
  ariaLabel?: string;
  isDark?: boolean;
  layoutRunning?: boolean;
  onNodeHover?: (nodeId: string | null) => void;
  highlightNodeIds?: ReadonlySet<string>;
  highlightEdgeIds?: ReadonlySet<string>;
  originNodeId?: string | null;
}

export function GraphCanvas({
  nodes, edges, viewport, selection, showGrid, canvasRef,
  onMouseDown, onMouseMove, onMouseUp, onWheel, onDoubleClick, onContextMenu,
  previewRef, hoverNodeIdRef, mouseWorldRef, onDropImage,
  viewportAnimRef, onViewportUpdate,
  velocityRef, onPanInertia,
  draggingNodeIds,
  ariaLabel,
  isDark = true,
  layoutRunning,
  onNodeHover,
  highlightNodeIds,
  highlightEdgeIds,
  originNodeId,
}: Readonly<GraphCanvasProps>) {
  const rafRef = useRef<number>(0);
  const prevHoverRef = useRef<string | undefined>(undefined);

  // コネクタパス計算をメモ化（edges/nodes変更時のみ再計算）
  const resolvedEdges = useMemo(() => {
    // フォースレイアウト中は高速パス：中心間の直線描画
    if (layoutRunning) {
      return edges.map(e => {
        if (e.type === 'connector' && e.from.nodeId && e.to.nodeId) {
          const fromNode = nodes.find(n => n.id === e.from.nodeId);
          const toNode = nodes.find(n => n.id === e.to.nodeId);
          if (fromNode && toNode) {
            return {
              ...e,
              type: 'line' as const,
              waypoints: undefined,
              bezierPath: undefined,
              from: {
                ...e.from,
                x: fromNode.x + fromNode.width / 2,
                y: fromNode.y + fromNode.height / 2,
              },
              to: {
                ...e.to,
                x: toNode.x + toNode.width / 2,
                y: toNode.y + toNode.height / 2,
              },
            };
          }
        }
        return e;
      });
    }

    // 同一ノードペア間のエッジ数をカウント（パス重複回避用）
    const pairCount = new Map<string, number>();

    return edges.map(e => {
      if (e.type === 'connector' && e.from.nodeId && e.to.nodeId) {
        const fromNode = nodes.find(n => n.id === e.from.nodeId);
        const toNode = nodes.find(n => n.id === e.to.nodeId);
        if (fromNode && toNode) {
          const routing = e.style.routing ?? 'orthogonal';

          // 同一ノードペアの並列エッジ用オフセット計算
          const pairKey = [e.from.nodeId, e.to.nodeId].sort((a, b) => (a ?? '').localeCompare(b ?? '')).join(':');
          const parallelIndex = pairCount.get(pairKey) ?? 0;
          pairCount.set(pairKey, parallelIndex + 1);
          const pairTotal = edges.filter(e2 =>
            e2.type === 'connector' && e2.from.nodeId && e2.to.nodeId &&
            [e2.from.nodeId, e2.to.nodeId].sort((a, b) => (a ?? '').localeCompare(b ?? '')).join(':') === pairKey,
          ).length;
          const sides = bestSides(fromNode, toNode);
          const fromPts = getConnectionPoints(fromNode);
          const toPts = getConnectionPoints(toNode);
          let fromPt = fromPts.find(p => p.side === sides.fromSide) ?? fromPts[0];
          let toPt = toPts.find(p => p.side === sides.toSide) ?? toPts[0];
          if (pairTotal > 1) {
            const offset = (parallelIndex - (pairTotal - 1) / 2) * 15;
            fromPt = offsetAlongSide(fromPt, sides.fromSide, offset);
            toPt = offsetAlongSide(toPt, sides.toSide, offset);
          }

          if (routing === 'bezier') {
            const bezierPath = computeBezierPath(fromNode, toNode);
            if (pairTotal > 1) {
              bezierPath[0] = fromPt;
              bezierPath[3] = toPt;
              // 中心から左右対称にカーブ方向をずらす
              const deflection = (parallelIndex - (pairTotal - 1) / 2) * 60;
              bezierPath[1] = deflectControlPoint(bezierPath[1], sides.fromSide, deflection);
              bezierPath[2] = deflectControlPoint(bezierPath[2], sides.toSide, deflection);
            }
            return {
              ...e,
              from: { ...e.from, ...bezierPath[0] },
              to: { ...e.to, ...bezierPath[3] },
              bezierPath,
            };
          }

          if (routing === 'straight') {
            return { ...e, from: { ...e.from, ...fromPt }, to: { ...e.to, ...toPt } };
          }

          // Manual waypoints: user-defined path overrides auto-routing
          if (e.manualWaypoints?.length) {
            const waypoints = [fromPt, ...e.manualWaypoints, toPt];
            return { ...e, from: { ...e.from, ...fromPt }, to: { ...e.to, ...toPt }, waypoints };
          }

          // manualMidpoint backward compat
          if (e.manualMidpoint !== undefined) {
            const waypoints = computeOrthogonalPath(fromNode, toNode, 20, e.manualMidpoint);
            return { ...e, from: { ...e.from, ...waypoints[0] }, to: { ...e.to, ...(waypoints.at(-1) ?? waypoints[0]) }, waypoints };
          }

          // Orthogonal routing
          const waypoints = computeVisibilityPath(fromPt, sides.fromSide, toPt, sides.toSide, []);
          return { ...e, from: { ...e.from, ...waypoints[0] }, to: { ...e.to, ...(waypoints.at(-1) ?? waypoints[0]) }, waypoints };
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
  }, [edges, nodes, layoutRunning]);

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

    // 慣性スクロール（reduced-motion 時は即停止）
    if (velocityRef && onPanInertia) {
      const vel = velocityRef.current;
      const prefersReducedMotion = typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReducedMotion) {
        vel.vx = 0;
        vel.vy = 0;
      } else if (Math.abs(vel.vx) > 0.5 || Math.abs(vel.vy) > 0.5) {
        onPanInertia(vel.vx, vel.vy);
        vel.vx *= 0.92;
        vel.vy *= 0.92;
        if (Math.abs(vel.vx) < 0.5) vel.vx = 0;
        if (Math.abs(vel.vy) < 0.5) vel.vy = 0;
      }
    }

    render({
      ctx, width: canvas.width, height: canvas.height,
      nodes, edges: resolvedEdges, viewport: activeViewport, selection, showGrid,
      hoverNodeId: hoverNodeIdRef.current,
      mouseWorldX: mouseWorldRef.current.x, mouseWorldY: mouseWorldRef.current.y,
      draggingNodeIds,
      isDark,
    });

    // ホバーノード変更時にコールバック通知
    if (onNodeHover) {
      const currentHover = hoverNodeIdRef.current;
      if (currentHover !== prevHoverRef.current) {
        prevHoverRef.current = currentHover;
        onNodeHover(currentHover ?? null);
      }
    }

    // パスハイライト描画
    if (highlightNodeIds && highlightNodeIds.size > 0) {
      ctx.save();
      ctx.translate(activeViewport.offsetX, activeViewport.offsetY);
      ctx.scale(activeViewport.scale, activeViewport.scale);

      // ハイライト対象外のノードを暗くする
      for (const node of nodes) {
        if (!highlightNodeIds.has(node.id)) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
          ctx.fillRect(node.x, node.y, node.width, node.height);
        }
      }

      // ハイライトエッジを太い金色で描画
      if (highlightEdgeIds) {
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.8;
        for (const edge of resolvedEdges) {
          if (!highlightEdgeIds.has(edge.id)) continue;
          ctx.beginPath();
          if (edge.waypoints && edge.waypoints.length >= 2) {
            ctx.moveTo(edge.waypoints[0].x, edge.waypoints[0].y);
            for (let i = 1; i < edge.waypoints.length; i++) {
              ctx.lineTo(edge.waypoints[i].x, edge.waypoints[i].y);
            }
          } else if (edge.bezierPath?.length === 4) {
            const [s, c1, c2, e] = edge.bezierPath;
            ctx.moveTo(s.x, s.y);
            ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, e.x, e.y);
          } else {
            ctx.moveTo(edge.from.x, edge.from.y);
            ctx.lineTo(edge.to.x, edge.to.y);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // オリジンノードマーカー
      if (originNodeId) {
        const originNode = nodes.find(n => n.id === originNodeId);
        if (originNode) {
          ctx.strokeStyle = '#FFD700';
          ctx.lineWidth = 3;
          ctx.setLineDash([6, 3]);
          ctx.strokeRect(originNode.x - 4, originNode.y - 4, originNode.width + 8, originNode.height + 8);
          ctx.setLineDash([]);
        }
      }

      ctx.restore();
    }

    // ドラッグプレビュー描画
    const preview = previewRef.current;
    if (preview.type !== 'none') {
      ctx.save();
      ctx.translate(activeViewport.offsetX, activeViewport.offsetY);
      ctx.scale(activeViewport.scale, activeViewport.scale);
      if (preview.type === 'edge' && preview.edgeType) {
        if (preview.snapNodeId) {
          const snapNode = nodes.find(n => n.id === preview.snapNodeId);
          if (snapNode) drawSnapHighlight(ctx, snapNode, getCanvasColors(isDark));
        }
        const isValidTarget = !!preview.snapNodeId;
        drawEdgePreview(ctx, preview.fromX, preview.fromY, preview.toX, preview.toY, preview.edgeType, isValidTarget, getCanvasColors(isDark));
      } else if (preview.type === 'shape' && preview.shapeType) {
        drawShapePreview(ctx, preview.fromX, preview.fromY, preview.toX, preview.toY, preview.shapeType, getCanvasColors(isDark));
      } else if (preview.type === 'select-rect') {
        const x = Math.min(preview.fromX, preview.toX);
        const y = Math.min(preview.fromY, preview.toY);
        const w = Math.abs(preview.toX - preview.fromX);
        const h = Math.abs(preview.toY - preview.fromY);
        drawSelectionRect(ctx, x, y, w, h, getCanvasColors(isDark));
      }
      ctx.restore();
    }

    // スマートガイド描画
    if (preview.guides && preview.guides.length > 0) {
      ctx.save();
      ctx.translate(activeViewport.offsetX, activeViewport.offsetY);
      ctx.scale(activeViewport.scale, activeViewport.scale);
      drawSmartGuides(ctx, preview.guides, getCanvasColors(isDark));
      ctx.restore();
    }
  }, [canvasRef, nodes, resolvedEdges, viewport, selection, showGrid, previewRef, hoverNodeIdRef, mouseWorldRef, viewportAnimRef, onViewportUpdate, velocityRef, onPanInertia, draggingNodeIds, isDark, onNodeHover, highlightNodeIds, highlightEdgeIds, originNodeId]);

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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length === 0 || !onDropImage || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const img = new Image();
        img.onload = () => {
          // アスペクト比を維持して最大300px幅に
          const maxW = 300;
          const scale = img.width > maxW ? maxW / img.width : 1;
          const w = img.width * scale;
          const h = img.height * scale;
          onDropImage(dataUrl, sx, sy, w, h);
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
  }, [canvasRef, onDropImage]);

  return (
    <canvas
      ref={canvasRef}
      tabIndex={0}
      aria-label={ariaLabel}
      aria-roledescription="graph canvas"
      style={{ display: 'block', width: '100%', height: '100%' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    />
  );
}
