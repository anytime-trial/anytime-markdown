import { GraphNode, GraphEdge, Viewport, SelectionState } from '../types';
import { CANVAS_BG, CANVAS_GRID, COLOR_ICE_BLUE, FONT_FAMILY } from '../theme';
import { getVisibleBounds, isNodeVisible, isEdgeVisible } from './culling';
import { drawNode, drawLockIndicator, drawRoundedRect } from './shapes';
import { drawEdge } from './edgeRenderer';
import { drawResizeHandles, drawBoundingBox, drawConnectionPoints, drawEdgeEndpointHandles } from './overlays';

const GRID_SIZE = 20;

export interface RenderOptions {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  viewport: Viewport;
  selection: SelectionState;
  showGrid: boolean;
  hoverNodeId?: string;
  mouseWorldX?: number;
  mouseWorldY?: number;
  draggingNodeIds?: string[];
}

export function render(options: RenderOptions): void {
  const {
    ctx, width, height, nodes, edges, viewport, selection,
    showGrid, hoverNodeId, mouseWorldX, mouseWorldY, draggingNodeIds,
  } = options;

  ctx.fillStyle = CANVAS_BG;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(viewport.offsetX, viewport.offsetY);
  ctx.scale(viewport.scale, viewport.scale);

  if (showGrid) drawGrid(ctx, viewport, width, height);

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
  frameNodes.forEach(n => drawNode(ctx, n, selection.nodeIds.includes(n.id)));
  visibleEdges.forEach(e => drawEdge(ctx, e, selection.edgeIds.includes(e.id)));
  nonFrameNodes.forEach(n => {
    const isDragging = draggingNodeIds?.includes(n.id) ?? false;
    drawNode(ctx, n, selection.nodeIds.includes(n.id), isDragging);
    if (n.locked) drawLockIndicator(ctx, n, viewport.scale);
  });
  // 単一選択時のみ個別リサイズハンドル表示
  if (selection.nodeIds.length === 1) {
    const sn = nodes.find(n => n.id === selection.nodeIds[0]);
    if (sn) drawResizeHandles(ctx, sn, viewport.scale);
  }

  // マルチ選択バウンディングボックス
  const selectedNodes = nodes.filter(n => selection.nodeIds.includes(n.id));
  if (selectedNodes.length >= 2) {
    drawBoundingBox(ctx, selectedNodes, viewport.scale);
  }

  // 選択中エッジのエンドポイントハンドル
  edges
    .filter(e => selection.edgeIds.includes(e.id))
    .forEach(e => drawEdgeEndpointHandles(ctx, e, viewport.scale));

  // ホバー接続ポイント
  if (hoverNodeId) {
    const hoverNode = nodes.find(n => n.id === hoverNodeId);
    if (hoverNode) drawConnectionPoints(ctx, hoverNode, viewport.scale, mouseWorldX, mouseWorldY);
  }

  // ホバー中ノードのURL表示
  if (hoverNodeId) {
    const hoverNode = nodes.find(n => n.id === hoverNodeId);
    if (hoverNode?.url && mouseWorldX !== undefined && mouseWorldY !== undefined) {
      ctx.save();
      ctx.font = `11px ${FONT_FAMILY}`;
      const urlText = hoverNode.url.length > 50 ? hoverNode.url.slice(0, 50) + '...' : hoverNode.url;
      const metrics = ctx.measureText(urlText);
      const pad = 4;
      const tipX = mouseWorldX + 12;
      const tipY = mouseWorldY + 16;

      // 背景
      ctx.fillStyle = 'rgba(13, 17, 23, 0.9)';
      drawRoundedRect(ctx, tipX - pad, tipY - pad, metrics.width + pad * 2, 16 + pad * 2, 4);
      ctx.fill();
      // 枠線
      ctx.strokeStyle = 'rgba(144, 202, 249, 0.3)';
      ctx.lineWidth = 1;
      drawRoundedRect(ctx, tipX - pad, tipY - pad, metrics.width + pad * 2, 16 + pad * 2, 4);
      ctx.stroke();
      // テキスト
      ctx.fillStyle = COLOR_ICE_BLUE;
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
): void {
  ctx.save();
  ctx.strokeStyle = CANVAS_GRID;
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
