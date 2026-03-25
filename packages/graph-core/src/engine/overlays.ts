import { GraphNode, GraphEdge, NodeType } from '../types';
import type { GuideLine } from './smartGuide';
import { CanvasColors, getCanvasColors } from '../theme';
import { drawRoundedRect, drawDiamond, drawParallelogram, drawCylinderBody, drawCylinderTop } from './shapes';
import { HANDLE_SIZE, SNAP_INDICATOR_RADIUS, DASH_DEFAULT, DASH_OVERLAY } from './constants';
import { getConnectionPoints } from './connector';

export function drawResizeHandles(
  ctx: CanvasRenderingContext2D,
  node: GraphNode,
  scale: number,
  colors?: CanvasColors,
): void {
  colors = colors ?? getCanvasColors(true);
  const { x, y, width, height } = node;
  const handleSize = HANDLE_SIZE / scale;
  const half = handleSize / 2;

  const handles = [
    { hx: x, hy: y },                              // top-left
    { hx: x + width / 2, hy: y },                  // top-center
    { hx: x + width, hy: y },                       // top-right
    { hx: x + width, hy: y + height / 2 },          // middle-right
    { hx: x + width, hy: y + height },               // bottom-right
    { hx: x + width / 2, hy: y + height },           // bottom-center
    { hx: x, hy: y + height },                       // bottom-left
    { hx: x, hy: y + height / 2 },                   // middle-left
  ];

  ctx.save();
  ctx.fillStyle = colors.handleFill;
  ctx.strokeStyle = colors.canvasSelection;
  ctx.lineWidth = 1.5 / scale;

  handles.forEach(({ hx, hy }) => {
    ctx.fillRect(hx - half, hy - half, handleSize, handleSize);
    ctx.strokeRect(hx - half, hy - half, handleSize, handleSize);
  });

  ctx.restore();
}

/** マルチ選択時のバウンディングボックス + リサイズハンドル */
export function drawBoundingBox(
  ctx: CanvasRenderingContext2D,
  selectedNodes: GraphNode[],
  scale: number,
  colors?: CanvasColors,
): void {
  colors = colors ?? getCanvasColors(true);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of selectedNodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  const pad = 6 / scale;
  const bx = minX - pad;
  const by = minY - pad;
  const bw = maxX - minX + pad * 2;
  const bh = maxY - minY + pad * 2;

  ctx.save();
  // 破線枠
  ctx.strokeStyle = colors.canvasSelection;
  ctx.lineWidth = 1 / scale;
  ctx.setLineDash(DASH_OVERLAY.map(v => v / scale));
  ctx.strokeRect(bx, by, bw, bh);
  ctx.setLineDash([]);

  // 8点ハンドル
  const hs = HANDLE_SIZE / scale;
  const half = hs / 2;
  const handles = [
    { hx: bx, hy: by }, { hx: bx + bw / 2, hy: by }, { hx: bx + bw, hy: by },
    { hx: bx + bw, hy: by + bh / 2 },
    { hx: bx + bw, hy: by + bh }, { hx: bx + bw / 2, hy: by + bh }, { hx: bx, hy: by + bh },
    { hx: bx, hy: by + bh / 2 },
  ];
  ctx.fillStyle = colors.handleFill;
  ctx.strokeStyle = colors.canvasSelection;
  ctx.lineWidth = 1.5 / scale;
  for (const { hx, hy } of handles) {
    ctx.fillRect(hx - half, hy - half, hs, hs);
    ctx.strokeRect(hx - half, hy - half, hs, hs);
  }
  ctx.restore();
}

/** 選択中エッジの両端にドラッグ可能なハンドルを描画 */
export function drawEdgeEndpointHandles(
  ctx: CanvasRenderingContext2D,
  edge: GraphEdge,
  scale: number,
  colors?: CanvasColors,
): void {
  colors = colors ?? getCanvasColors(true);
  const r = 7 / scale;
  const pts = edge.waypoints && edge.waypoints.length >= 2
    ? [edge.waypoints[0], edge.waypoints[edge.waypoints.length - 1]]
    : [{ x: edge.from.x, y: edge.from.y }, { x: edge.to.x, y: edge.to.y }];

  ctx.save();
  for (const pt of pts) {
    // 外円
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
    ctx.fillStyle = colors.canvasSelection;
    ctx.fill();
    // 内円
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = colors.canvasBg;
    ctx.fill();
  }
  ctx.restore();
}

/** ホバー時の接続ポイント（マウスに最も近い1点のみ描画） */
export function drawConnectionPoints(
  ctx: CanvasRenderingContext2D,
  node: GraphNode,
  scale: number,
  mouseWX?: number,
  mouseWY?: number,
  colors?: CanvasColors,
): void {
  colors = colors ?? getCanvasColors(true);
  const r = 6 / scale;
  const points = getConnectionPoints(node);

  // マウス座標が渡された場合、最も近い1点のみ表示
  let visiblePoints = points;
  if (mouseWX !== undefined && mouseWY !== undefined) {
    let best = points[0];
    let bestDist = Infinity;
    for (const p of points) {
      const d = Math.hypot(p.x - mouseWX, p.y - mouseWY);
      if (d < bestDist) { bestDist = d; best = p; }
    }
    visiblePoints = [best];
  }

  ctx.save();
  for (const { x: px, y: py } of visiblePoints) {
    // 外円
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = colors.canvasSelection;
    ctx.fill();
    // 内円
    ctx.beginPath();
    ctx.arc(px, py, r * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = colors.canvasBg;
    ctx.fill();
  }
  ctx.restore();
}

/** スナップ対象ノードのハイライト枠を描画 */
export function drawSnapHighlight(
  ctx: CanvasRenderingContext2D,
  node: GraphNode,
  colors?: CanvasColors,
): void {
  colors = colors ?? getCanvasColors(true);
  ctx.save();
  ctx.strokeStyle = colors.canvasSnap;
  ctx.lineWidth = 3;
  ctx.setLineDash([]);

  const pad = 4;
  const { x, y, width, height, type } = node;

  if (type === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(x + width / 2, y + height / 2, width / 2 + pad, height / 2 + pad, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.strokeRect(x - pad, y - pad, width + pad * 2, height + pad * 2);
  }

  // 接続点インジケータ（ノードの4辺中央に丸を表示）
  ctx.fillStyle = colors.canvasSnap;
  const points = [
    { px: x + width / 2, py: y },             // top
    { px: x + width, py: y + height / 2 },    // right
    { px: x + width / 2, py: y + height },     // bottom
    { px: x, py: y + height / 2 },             // left
  ];
  for (const { px, py } of points) {
    ctx.beginPath();
    ctx.arc(px, py, SNAP_INDICATOR_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
  // 内円
  ctx.fillStyle = colors.canvasSnapInner;
  for (const { px, py } of points) {
    ctx.beginPath();
    ctx.arc(px, py, SNAP_INDICATOR_RADIUS - 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/** ドラッグ中のシェイププレビューを描画 */
export function drawShapePreview(
  ctx: CanvasRenderingContext2D,
  fromX: number, fromY: number,
  toX: number, toY: number,
  shapeType: Exclude<NodeType, 'image'>,
  colors?: CanvasColors,
): void {
  colors = colors ?? getCanvasColors(true);
  const x = Math.min(fromX, toX);
  const y = Math.min(fromY, toY);
  const w = Math.abs(toX - fromX);
  const h = Math.abs(toY - fromY);
  if (w < 2 && h < 2) return;

  ctx.save();
  ctx.strokeStyle = colors.canvasSelection;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([...DASH_OVERLAY]);
  ctx.fillStyle = colors.canvasSelectionFill;

  if (shapeType === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (shapeType === 'diamond') {
    drawDiamond(ctx, x, y, w, h);
    ctx.fill();
    ctx.stroke();
  } else if (shapeType === 'parallelogram') {
    drawParallelogram(ctx, x, y, w, h);
    ctx.fill();
    ctx.stroke();
  } else if (shapeType === 'cylinder') {
    drawCylinderBody(ctx, x, y, w, h);
    ctx.fill();
    ctx.stroke();
    drawCylinderTop(ctx, x, y, w, h);
    ctx.stroke();
  } else {
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  }

  ctx.setLineDash([]);
  ctx.restore();
}

export function drawSmartGuides(
  ctx: CanvasRenderingContext2D,
  guides: GuideLine[],
  colors?: CanvasColors,
): void {
  colors = colors ?? getCanvasColors(true);
  ctx.save();
  ctx.strokeStyle = colors.canvasSmartGuide;
  ctx.lineWidth = 0.5;
  ctx.setLineDash([...DASH_DEFAULT]);
  for (const g of guides) {
    ctx.beginPath();
    if (g.axis === 'x') {
      ctx.moveTo(g.position, g.from - 10);
      ctx.lineTo(g.position, g.to + 10);
    } else {
      ctx.moveTo(g.from - 10, g.position);
      ctx.lineTo(g.to + 10, g.position);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

export function drawSelectionRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  colors?: CanvasColors,
): void {
  colors = colors ?? getCanvasColors(true);
  ctx.save();

  ctx.fillStyle = colors.canvasSelectionFill;
  ctx.fillRect(x, y, width, height);

  ctx.strokeStyle = colors.canvasSelection;
  ctx.lineWidth = 1;
  ctx.setLineDash([...DASH_DEFAULT]);
  ctx.strokeRect(x, y, width, height);
  ctx.setLineDash([]);

  ctx.restore();
}
