import { GraphNode, GraphEdge, Viewport, SelectionState } from '../types';
import { CanvasColors, getCanvasColors, FONT_FAMILY } from '../theme';
import { FONT_SIZE_TOOLTIP, URL_TRUNCATE_LENGTH } from './constants';
import { getVisibleBounds, isNodeVisible, isEdgeVisible } from './culling';
import { drawNode, drawLockIndicator, drawRoundedRect } from './shapes';
import { drawEdge } from './edgeRenderer';
import { drawResizeHandles, drawBoundingBox, drawConnectionPoints, drawEdgeEndpointHandles } from './overlays';

const GRID_SIZE = 20;

export interface RenderOptions {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
  viewport: Viewport;
  selection: SelectionState;
  showGrid: boolean;
  hoverNodeId?: string;
  mouseWorldX?: number;
  mouseWorldY?: number;
  draggingNodeIds?: string[];
  isDark?: boolean;
}

export function render(options: RenderOptions): void {
  const {
    ctx, width, height, nodes, edges, viewport, selection,
    showGrid, hoverNodeId, mouseWorldX, mouseWorldY, draggingNodeIds,
    isDark = true,
  } = options;

  const colors = getCanvasColors(isDark);

  ctx.fillStyle = colors.canvasBg;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(viewport.offsetX, viewport.offsetY);
  ctx.scale(viewport.scale, viewport.scale);

  if (showGrid) drawGrid(ctx, viewport, width, height, colors);

  // ビューポートカリング
  const visibleBounds = getVisibleBounds(viewport, width, height);

  // zIndex順にソートして描画（フレームは常に背面）
  const sortedNodes = [...nodes].sort((a, b) => {
    const aIsFrame = a.type === 'frame' ? 0 : 1;
    const bIsFrame = b.type === 'frame' ? 0 : 1;
    if (aIsFrame !== bIsFrame) return aIsFrame - bIsFrame;
    return (a.zIndex ?? 0) - (b.zIndex ?? 0);
  });
  const frameNodes: GraphNode[] = [];
  const nonFrameNodes: GraphNode[] = [];
  for (const n of sortedNodes) {
    if (!isNodeVisible(n, visibleBounds)) continue;
    if (n.type === 'frame') {
      frameNodes.push(n);
    } else {
      nonFrameNodes.push(n);
    }
  }
  const visibleEdges: GraphEdge[] = [];
  for (const e of edges) {
    if (isEdgeVisible(e, visibleBounds)) {
      visibleEdges.push(e);
    }
  }
  frameNodes.forEach(n => drawNode(ctx, n, selection.nodeIds.includes(n.id), false, colors));
  visibleEdges.forEach(e => drawEdge(ctx, e, selection.edgeIds.includes(e.id), colors));
  nonFrameNodes.forEach(n => {
    const isDragging = draggingNodeIds?.includes(n.id) ?? false;
    drawNode(ctx, n, selection.nodeIds.includes(n.id), isDragging, colors);
    if (n.locked) drawLockIndicator(ctx, n, viewport.scale, colors);
  });
  // 単一選択時のみ個別リサイズハンドル表示
  if (selection.nodeIds.length === 1) {
    const sn = nodes.find(n => n.id === selection.nodeIds[0]);
    if (sn) drawResizeHandles(ctx, sn, viewport.scale, colors);
  }

  // マルチ選択バウンディングボックス
  const selectedNodes = nodes.filter(n => selection.nodeIds.includes(n.id));
  if (selectedNodes.length >= 2) {
    drawBoundingBox(ctx, selectedNodes, viewport.scale, colors);
  }

  // 選択中エッジのエンドポイントハンドル
  edges
    .filter(e => selection.edgeIds.includes(e.id))
    .forEach(e => drawEdgeEndpointHandles(ctx, e, viewport.scale, colors));

  // ホバー接続ポイント
  if (hoverNodeId) {
    const hoverNode = nodes.find(n => n.id === hoverNodeId);
    if (hoverNode) drawConnectionPoints(ctx, hoverNode, viewport.scale, mouseWorldX, mouseWorldY, colors);
  }

  // ホバー中ノードのURL表示
  if (hoverNodeId) {
    const hoverNode = nodes.find(n => n.id === hoverNodeId);
    if (hoverNode?.url && mouseWorldX !== undefined && mouseWorldY !== undefined) {
      ctx.save();
      ctx.font = `${FONT_SIZE_TOOLTIP}px ${FONT_FAMILY}`;
      const urlText = hoverNode.url.length > URL_TRUNCATE_LENGTH ? hoverNode.url.slice(0, URL_TRUNCATE_LENGTH) + '...' : hoverNode.url;
      const metrics = ctx.measureText(urlText);
      const pad = 4;
      const tipX = mouseWorldX + 12;
      const tipY = mouseWorldY + 16;

      // 背景
      ctx.fillStyle = colors.tooltipBg;
      drawRoundedRect(ctx, tipX - pad, tipY - pad, metrics.width + pad * 2, 16 + pad * 2, 4);
      ctx.fill();
      // 枠線
      ctx.strokeStyle = colors.tooltipBorder;
      ctx.lineWidth = 1;
      drawRoundedRect(ctx, tipX - pad, tipY - pad, metrics.width + pad * 2, 16 + pad * 2, 4);
      ctx.stroke();
      // テキスト
      ctx.fillStyle = colors.tooltipText;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(urlText, tipX, tipY);
      ctx.restore();
    }
  }

  ctx.restore();
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  width: number,
  height: number,
  colors?: CanvasColors,
): void {
  ctx.save();
  ctx.strokeStyle = colors?.canvasGrid ?? 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 0.5 / viewport.scale;

  const startX = Math.floor(-viewport.offsetX / viewport.scale / GRID_SIZE) * GRID_SIZE;
  const startY = Math.floor(-viewport.offsetY / viewport.scale / GRID_SIZE) * GRID_SIZE;
  const endX = startX + width / viewport.scale + GRID_SIZE;
  const endY = startY + height / viewport.scale + GRID_SIZE;

  ctx.beginPath();
  for (let x = startX; x <= endX; x += GRID_SIZE) {
    ctx.moveTo(x, startY);
    ctx.lineTo(x, endY);
  }
  for (let y = startY; y <= endY; y += GRID_SIZE) {
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
  }
  ctx.stroke();
  ctx.restore();
}
