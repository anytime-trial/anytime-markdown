import { GraphNode, GraphEdge, GraphGroup, Viewport, SelectionState } from '../types';
import { CanvasColors, getCanvasColors, FONT_FAMILY } from '../theme';
import { FONT_SIZE_TOOLTIP, GROUP_PADDING, URL_TRUNCATE_LENGTH } from './constants';
import { clusterByY } from './groupClustering';
import { getVisibleBounds, isNodeVisible, isEdgeVisible } from './culling';
import { drawRoundedRect } from './shapes';
import { drawNode, drawLockIndicator } from './shapeRenderers';
import { drawEdge } from './edgeRenderer';
import { drawResizeHandles, drawBoundingBox, drawConnectionPoints, drawEdgeEndpointHandles } from './overlays';

const GRID_SIZE = 20;

export interface RenderOptions {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
  groups?: readonly GraphGroup[];
  viewport: Viewport;
  selection: SelectionState;
  showGrid: boolean;
  hoverNodeId?: string;
  mouseWorldX?: number;
  mouseWorldY?: number;
  draggingNodeIds?: string[];
  isDark?: boolean;
}

interface VisibleElements {
  frameNodes: GraphNode[];
  nonFrameNodes: GraphNode[];
  visibleEdges: GraphEdge[];
}

export function render(options: RenderOptions): void {
  const {
    ctx, width, height, nodes, edges, groups, viewport, selection,
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

  const { frameNodes, nonFrameNodes, visibleEdges } = computeVisibleElements(nodes, edges, viewport, width, height);
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  if (groups?.length) drawGroups(ctx, groups, nodeMap, colors);
  visibleEdges.forEach(e => drawEdge(ctx, e, selection.edgeIds.includes(e.id), colors));
  frameNodes.forEach(n => drawNode(ctx, n, selection.nodeIds.includes(n.id), false, colors));
  nonFrameNodes.forEach(n => {
    const isDragging = draggingNodeIds?.includes(n.id) ?? false;
    drawNode(ctx, n, selection.nodeIds.includes(n.id), isDragging, colors);
    if (n.locked) drawLockIndicator(ctx, n, viewport.scale, colors);
  });

  drawSelectionOverlays(ctx, nodes, edges, selection, viewport.scale, colors);
  drawHoverOverlays(ctx, nodes, hoverNodeId, mouseWorldX, mouseWorldY, viewport.scale, colors);

  ctx.restore();
}

/** ビューポートカリングと collapsed フレーム除外を適用し、描画対象の要素を返す */
function computeVisibleElements(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  viewport: Viewport,
  width: number,
  height: number,
): VisibleElements {
  const visibleBounds = getVisibleBounds(viewport, width, height);

  // collapsed フレームの子ノード・関連エッジを除外
  const collapsedFrameIds = new Set(
    nodes.filter(n => n.type === 'frame' && n.collapsed).map(n => n.id),
  );
  const hiddenNodeIds = new Set<string>();
  if (collapsedFrameIds.size > 0) {
    for (const n of nodes) {
      if (n.groupId && collapsedFrameIds.has(n.groupId)) {
        hiddenNodeIds.add(n.id);
      }
    }
  }

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
    if (hiddenNodeIds.has(n.id)) continue;
    if (!isNodeVisible(n, visibleBounds)) continue;
    if (n.type === 'frame') {
      frameNodes.push(n);
    } else {
      nonFrameNodes.push(n);
    }
  }

  const visibleEdges: GraphEdge[] = [];
  for (const e of edges) {
    if ((e.from.nodeId && hiddenNodeIds.has(e.from.nodeId)) ||
        (e.to.nodeId && hiddenNodeIds.has(e.to.nodeId))) continue;
    if (isEdgeVisible(e, visibleBounds)) {
      visibleEdges.push(e);
    }
  }

  return { frameNodes, nonFrameNodes, visibleEdges };
}

/** 選択状態に応じたオーバーレイ描画（リサイズハンドル、バウンディングボックス、エッジエンドポイント） */
function drawSelectionOverlays(
  ctx: CanvasRenderingContext2D,
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  selection: SelectionState,
  scale: number,
  colors: CanvasColors,
): void {
  // 単一選択時のみ個別リサイズハンドル表示
  if (selection.nodeIds.length === 1) {
    const sn = nodes.find(n => n.id === selection.nodeIds[0]);
    if (sn) drawResizeHandles(ctx, sn, scale, colors);
  }

  // マルチ選択バウンディングボックス
  const selectedNodes = nodes.filter(n => selection.nodeIds.includes(n.id));
  if (selectedNodes.length >= 2) {
    drawBoundingBox(ctx, selectedNodes, scale, colors);
  }

  // 選択中エッジのエンドポイントハンドル
  edges
    .filter(e => selection.edgeIds.includes(e.id))
    .forEach(e => drawEdgeEndpointHandles(ctx, e, scale, colors));
}

/** ホバー時の接続ポイントとURLツールチップ描画 */
function drawHoverOverlays(
  ctx: CanvasRenderingContext2D,
  nodes: readonly GraphNode[],
  hoverNodeId: string | undefined,
  mouseWorldX: number | undefined,
  mouseWorldY: number | undefined,
  scale: number,
  colors: CanvasColors,
): void {
  if (!hoverNodeId) return;

  const hoverNode = nodes.find(n => n.id === hoverNodeId);
  if (!hoverNode) return;

  drawConnectionPoints(ctx, hoverNode, scale, mouseWorldX, mouseWorldY, colors);

  if (hoverNode.url && mouseWorldX !== undefined && mouseWorldY !== undefined) {
    drawUrlTooltip(ctx, hoverNode.url, mouseWorldX, mouseWorldY, colors);
  }
}

/** ホバー中ノードのURL表示 */
function drawUrlTooltip(
  ctx: CanvasRenderingContext2D,
  url: string,
  mouseWorldX: number,
  mouseWorldY: number,
  colors: CanvasColors,
): void {
  ctx.save();
  ctx.font = `${FONT_SIZE_TOOLTIP}px ${FONT_FAMILY}`;
  const urlText = url.length > URL_TRUNCATE_LENGTH ? url.slice(0, URL_TRUNCATE_LENGTH) + '...' : url;
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

  const margin = GRID_SIZE * 2;
  const startX = Math.floor(-viewport.offsetX / viewport.scale / GRID_SIZE) * GRID_SIZE - margin;
  const startY = Math.floor(-viewport.offsetY / viewport.scale / GRID_SIZE) * GRID_SIZE - margin;
  const endX = Math.ceil((width - viewport.offsetX) / viewport.scale / GRID_SIZE) * GRID_SIZE + margin;
  const endY = Math.ceil((height - viewport.offsetY) / viewport.scale / GRID_SIZE) * GRID_SIZE + margin;

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

export interface GroupBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function computeGroupBounds(
  memberIds: readonly string[],
  nodeMap: Map<string, GraphNode>,
): GroupBounds | null {
  const members = memberIds.map(id => nodeMap.get(id)).filter((n): n is GraphNode => n !== undefined);
  if (members.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of members) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  return {
    x: minX - GROUP_PADDING,
    y: minY - GROUP_PADDING,
    width: maxX - minX + GROUP_PADDING * 2,
    height: maxY - minY + GROUP_PADDING * 2,
  };
}

/**
 * group メンバーを Y 方向にクラスタリングし、帯域ごとの bounds を返す。
 * splitManualTopBottom 等で上下に分かれた場合、帯域ごとに独立した破線枠として描画できる。
 */
export function computeGroupBoundsClusters(
  memberIds: readonly string[],
  nodeMap: Map<string, GraphNode>,
): GroupBounds[] {
  const members = memberIds.map(id => nodeMap.get(id)).filter((n): n is GraphNode => n !== undefined);
  if (members.length === 0) return [];
  const clusters = clusterByY(members);
  return clusters.map(cluster => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of cluster) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + n.height);
    }
    return {
      x: minX - GROUP_PADDING,
      y: minY - GROUP_PADDING,
      width: maxX - minX + GROUP_PADDING * 2,
      height: maxY - minY + GROUP_PADDING * 2,
    };
  });
}

function drawGroups(
  ctx: CanvasRenderingContext2D,
  groups: readonly GraphGroup[],
  nodeMap: Map<string, GraphNode>,
  colors: CanvasColors,
): void {
  ctx.save();
  ctx.strokeStyle = colors.panelBorder;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.fillStyle = 'transparent';

  for (const g of groups) {
    // Y 帯域ごとに独立した破線枠を描画
    const clusters = computeGroupBoundsClusters(g.memberIds, nodeMap);
    for (const bounds of clusters) {
      ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }
    // ラベルは最初（最上段）の帯域のみに表示
    if (g.label && clusters.length > 0) {
      const first = clusters[0];
      ctx.save();
      ctx.setLineDash([]);
      ctx.font = `10px ${FONT_FAMILY}`;
      ctx.fillStyle = colors.textSecondary;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(g.label, first.x + 4, first.y + 4);
      ctx.restore();
    }
  }
  ctx.restore();
}
