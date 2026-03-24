import { GraphNode, GraphEdge, Viewport, SelectionState, EndpointShape } from '../types';
import type { GuideLine } from './smartGuide';
import {
  CANVAS_BG, CANVAS_GRID, CANVAS_SELECTION, CANVAS_SELECTION_FILL,
  CANVAS_SNAP, CANVAS_SNAP_INNER, CANVAS_SMART_GUIDE,
  COLOR_TEXT_PRIMARY, COLOR_CHARCOAL, COLOR_TEXT_SECONDARY, FONT_FAMILY,
  DOC_ICON_COLOR,
} from '../theme';

const GRID_SIZE = 20;
const HANDLE_SIZE = 8;
const SELECTION_COLOR = CANVAS_SELECTION;
const BG_COLOR = CANVAS_BG;
const GRID_COLOR = CANVAS_GRID;
const TEXT_ON_SHAPE_COLOR = COLOR_TEXT_PRIMARY;
const LABEL_BG_COLOR = COLOR_CHARCOAL;
const LABEL_TEXT_COLOR = COLOR_TEXT_SECONDARY;

export function render(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  nodes: GraphNode[],
  edges: GraphEdge[],
  viewport: Viewport,
  selection: SelectionState,
  showGrid: boolean,
  hoverNodeId?: string,
  mouseWorldX?: number,
  mouseWorldY?: number,
): void {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(viewport.offsetX, viewport.offsetY);
  ctx.scale(viewport.scale, viewport.scale);

  if (showGrid) drawGrid(ctx, viewport, width, height);

  edges.forEach(e => drawEdge(ctx, e, selection.edgeIds.includes(e.id)));
  nodes.forEach(n => drawNode(ctx, n, selection.nodeIds.includes(n.id)));
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

  ctx.restore();
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  width: number,
  height: number,
): void {
  ctx.save();
  ctx.strokeStyle = GRID_COLOR;
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

/** グラデーション fill を生成 */
function makeFill(ctx: CanvasRenderingContext2D, style: GraphNode['style'], x: number, y: number, w: number, h: number): string | CanvasGradient {
  if (!style.gradientTo) return style.fill;
  const dir = style.gradientDirection ?? 'vertical';
  let grd: CanvasGradient;
  if (dir === 'horizontal') grd = ctx.createLinearGradient(x, y, x + w, y);
  else if (dir === 'diagonal') grd = ctx.createLinearGradient(x, y, x + w, y + h);
  else grd = ctx.createLinearGradient(x, y, x, y + h);
  grd.addColorStop(0, style.fill);
  grd.addColorStop(1, style.gradientTo);
  return grd;
}

/** 影を適用 */
function applyShadow(ctx: CanvasRenderingContext2D, style: GraphNode['style']): void {
  if (style.shadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
  }
}

function clearShadow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

export function drawNode(
  ctx: CanvasRenderingContext2D,
  node: GraphNode,
  selected: boolean,
): void {
  ctx.save();

  const { x, y, width, height, type, style, text } = node;
  const radius = style.borderRadius ?? 0;
  const fill = makeFill(ctx, style, x, y, width, height);

  if (type === 'sticky') {
    // sticky は常に影・角丸
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    if (style.shadow) { ctx.shadowBlur = 12; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3; }

    ctx.fillStyle = fill;
    drawRoundedRect(ctx, x, y, width, height, Math.max(4, radius));
    ctx.fill();

    clearShadow(ctx);
    ctx.strokeStyle = selected ? SELECTION_COLOR : style.stroke;
    ctx.lineWidth = selected ? 2 : style.strokeWidth;
    drawRoundedRect(ctx, x, y, width, height, Math.max(4, radius));
    ctx.stroke();
  } else if (type === 'ellipse') {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const rx = width / 2;
    const ry = height / 2;

    applyShadow(ctx, style);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    clearShadow(ctx);
    ctx.strokeStyle = selected ? SELECTION_COLOR : style.stroke;
    ctx.lineWidth = selected ? 2 : style.strokeWidth;
    ctx.stroke();
  } else if (type === 'text') {
    if (selected) {
      ctx.strokeStyle = SELECTION_COLOR;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, width, height);
      ctx.setLineDash([]);
    }
  } else if (type === 'diamond') {
    applyShadow(ctx, style);
    ctx.fillStyle = fill;
    drawDiamond(ctx, x, y, width, height);
    ctx.fill();
    clearShadow(ctx);
    ctx.strokeStyle = selected ? SELECTION_COLOR : style.stroke;
    ctx.lineWidth = selected ? 2 : style.strokeWidth;
    drawDiamond(ctx, x, y, width, height);
    ctx.stroke();
  } else if (type === 'parallelogram') {
    applyShadow(ctx, style);
    ctx.fillStyle = fill;
    drawParallelogram(ctx, x, y, width, height);
    ctx.fill();
    clearShadow(ctx);
    ctx.strokeStyle = selected ? SELECTION_COLOR : style.stroke;
    ctx.lineWidth = selected ? 2 : style.strokeWidth;
    drawParallelogram(ctx, x, y, width, height);
    ctx.stroke();
  } else if (type === 'cylinder') {
    applyShadow(ctx, style);
    ctx.fillStyle = fill;
    drawCylinderBody(ctx, x, y, width, height);
    ctx.fill();
    clearShadow(ctx);
    ctx.strokeStyle = selected ? SELECTION_COLOR : style.stroke;
    ctx.lineWidth = selected ? 2 : style.strokeWidth;
    drawCylinderBody(ctx, x, y, width, height);
    ctx.stroke();
    ctx.strokeStyle = selected ? SELECTION_COLOR : style.stroke;
    ctx.lineWidth = selected ? 2 : style.strokeWidth;
    drawCylinderTop(ctx, x, y, width, height);
    ctx.stroke();
  } else if (type === 'insight') {
    applyShadow(ctx, style);
    drawRoundedRect(ctx, x, y, width, height, Math.max(8, radius));
    ctx.fillStyle = fill;
    ctx.fill();
    clearShadow(ctx);
    ctx.strokeStyle = selected ? SELECTION_COLOR : style.stroke;
    ctx.lineWidth = selected ? 2 : style.strokeWidth;
    drawRoundedRect(ctx, x, y, width, height, Math.max(8, radius));
    ctx.stroke();
    // Label badge
    if (node.label) {
      const labelFont = `bold 10px ${FONT_FAMILY}`;
      ctx.font = labelFont;
      const labelW = ctx.measureText(node.label).width + 12;
      const badgeH = 18;
      const badgeX = x + 10;
      const badgeY = y + 10;
      drawRoundedRect(ctx, badgeX, badgeY, labelW, badgeH, 4);
      ctx.fillStyle = node.labelColor ?? '#90CAF9';
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.87)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.label, badgeX + 6, badgeY + badgeH / 2);
    }
    // Title (bold)
    if (text) {
      ctx.fillStyle = TEXT_ON_SHAPE_COLOR;
      ctx.font = `bold ${style.fontSize}px ${style.fontFamily}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(text, x + 10, y + 34, width - 20);
    }
  } else if (type === 'doc') {
    applyShadow(ctx, style);
    drawRoundedRect(ctx, x, y, width, height, Math.max(8, radius));
    ctx.fillStyle = fill;
    ctx.fill();
    clearShadow(ctx);
    ctx.strokeStyle = selected ? SELECTION_COLOR : style.stroke;
    ctx.lineWidth = selected ? 2 : style.strokeWidth;
    drawRoundedRect(ctx, x, y, width, height, Math.max(8, radius));
    ctx.stroke();
    // Doc icon
    ctx.fillStyle = DOC_ICON_COLOR;
    ctx.font = `18px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('\u{1F4C4}', x + 10, y + 10);
    // Title
    if (text) {
      ctx.fillStyle = TEXT_ON_SHAPE_COLOR;
      ctx.font = `bold ${style.fontSize}px ${style.fontFamily}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(text, x + 34, y + 14, width - 44);
    }
    // Preview text
    if (node.docContent) {
      ctx.fillStyle = COLOR_TEXT_SECONDARY;
      ctx.font = `11px ${FONT_FAMILY}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const preview = node.docContent.slice(0, 100).split('\n').slice(0, 3);
      preview.forEach((line, i) => {
        ctx.fillText(line.slice(0, 30), x + 10, y + 40 + i * 15, width - 20);
      });
    }
  } else {
    // rect
    applyShadow(ctx, style);
    ctx.fillStyle = fill;
    if (radius > 0) {
      drawRoundedRect(ctx, x, y, width, height, radius);
      ctx.fill();
      clearShadow(ctx);
      ctx.strokeStyle = selected ? SELECTION_COLOR : style.stroke;
      ctx.lineWidth = selected ? 2 : style.strokeWidth;
      drawRoundedRect(ctx, x, y, width, height, radius);
      ctx.stroke();
    } else {
      ctx.fillRect(x, y, width, height);
      clearShadow(ctx);
      ctx.strokeStyle = selected ? SELECTION_COLOR : style.stroke;
      ctx.lineWidth = selected ? 2 : style.strokeWidth;
      ctx.strokeRect(x, y, width, height);
    }
  }

  if (text && type !== 'insight' && type !== 'doc') {
    ctx.fillStyle = TEXT_ON_SHAPE_COLOR;
    ctx.font = `${style.fontSize}px ${style.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const padding = 8;
    const maxWidth = width - padding * 2;
    const lines = wrapText(ctx, text, maxWidth);
    const lineHeight = style.fontSize * 1.3;
    const totalHeight = lines.length * lineHeight;
    const startY = y + height / 2 - totalHeight / 2 + lineHeight / 2;

    lines.forEach((line, i) => {
      ctx.fillText(line, x + width / 2, startY + i * lineHeight, maxWidth);
    });
  }

  ctx.restore();
}

function drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w, y + h / 2);
  ctx.lineTo(x + w / 2, y + h);
  ctx.lineTo(x, y + h / 2);
  ctx.closePath();
}

function drawParallelogram(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const offset = w * 0.2;
  ctx.beginPath();
  ctx.moveTo(x + offset, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w - offset, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

function drawCylinderBody(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const ry = h * 0.12;
  ctx.beginPath();
  ctx.moveTo(x, y + ry);
  ctx.lineTo(x, y + h - ry);
  ctx.ellipse(x + w / 2, y + h - ry, w / 2, ry, 0, Math.PI, 0, true);
  ctx.lineTo(x + w, y + ry);
  ctx.ellipse(x + w / 2, y + ry, w / 2, ry, 0, 0, Math.PI, true);
  ctx.closePath();
}

function drawCylinderTop(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const ry = h * 0.12;
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + ry, w / 2, ry, 0, 0, Math.PI * 2);
  ctx.closePath();
}

export function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.arcTo(x + width, y, x + width, y + radius, radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
  ctx.lineTo(x + radius, y + height);
  ctx.arcTo(x, y + height, x, y + height - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let currentLine = '';

  for (const char of text) {
    if (char === '\n') {
      lines.push(currentLine);
      currentLine = '';
      continue;
    }

    const testLine = currentLine + char;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = char;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [''];
}

export function drawEdge(
  ctx: CanvasRenderingContext2D,
  edge: GraphEdge & { waypoints?: { x: number; y: number }[] },
  selected: boolean,
): void {
  ctx.save();

  const { from, to, style, type, waypoints } = edge;

  ctx.strokeStyle = selected ? SELECTION_COLOR : style.stroke;
  ctx.lineWidth = selected ? style.strokeWidth + 1 : style.strokeWidth;

  const color = selected ? SELECTION_COLOR : style.stroke;
  // 端点形状（未設定の場合、arrow/connectorタイプは endShape='arrow' をデフォルトにする）
  const startShape: EndpointShape = style.startShape ?? 'none';
  const endShape: EndpointShape = style.endShape ?? ((type === 'arrow' || type === 'connector') ? 'arrow' : 'none');

  if (waypoints && waypoints.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(waypoints[0].x, waypoints[0].y);
    for (let i = 1; i < waypoints.length; i++) {
      ctx.lineTo(waypoints[i].x, waypoints[i].y);
    }
    ctx.stroke();
    const first = waypoints[0];
    const second = waypoints[1];
    const last = waypoints[waypoints.length - 1];
    const prev = waypoints[waypoints.length - 2];
    drawEndpointShape(ctx, startShape, first.x, first.y, second.x, second.y, color);
    drawEndpointShape(ctx, endShape, last.x, last.y, prev.x, prev.y, color);
  } else {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    drawEndpointShape(ctx, startShape, from.x, from.y, to.x, to.y, color);
    drawEndpointShape(ctx, endShape, to.x, to.y, from.x, from.y, color);
  }

  if (edge.label) {
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    ctx.fillStyle = LABEL_BG_COLOR;
    const labelMetrics = ctx.measureText(edge.label);
    const padding = 4;
    ctx.fillRect(
      midX - labelMetrics.width / 2 - padding,
      midY - 8 - padding,
      labelMetrics.width + padding * 2,
      16 + padding * 2,
    );
    ctx.fillStyle = LABEL_TEXT_COLOR;
    ctx.font = `12px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(edge.label, midX, midY);
  }

  ctx.restore();
}

export function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
): void {
  const headLength = 12;
  const angle = Math.atan2(toY - fromY, toX - fromX);

  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - headLength * Math.cos(angle - Math.PI / 6),
    toY - headLength * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    toX - headLength * Math.cos(angle + Math.PI / 6),
    toY - headLength * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** 端点形状を描画 */
function drawEndpointShape(
  ctx: CanvasRenderingContext2D,
  shape: EndpointShape,
  tipX: number, tipY: number,
  fromX: number, fromY: number,
  color: string,
): void {
  if (shape === 'none') return;
  const angle = Math.atan2(tipY - fromY, tipX - fromX);
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  if (shape === 'arrow') {
    const len = 12;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - len * Math.cos(angle - Math.PI / 6), tipY - len * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(tipX - len * Math.cos(angle + Math.PI / 6), tipY - len * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  } else if (shape === 'circle') {
    const r = 5;
    ctx.beginPath();
    ctx.arc(tipX - r * Math.cos(angle), tipY - r * Math.sin(angle), r, 0, Math.PI * 2);
    ctx.fill();
  } else if (shape === 'diamond') {
    const s = 8;
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-s, -s / 2);
    ctx.lineTo(-s * 2, 0);
    ctx.lineTo(-s, s / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else if (shape === 'bar') {
    const len = 8;
    ctx.beginPath();
    ctx.moveTo(tipX - len * Math.cos(angle - Math.PI / 2), tipY - len * Math.sin(angle - Math.PI / 2));
    ctx.lineTo(tipX + len * Math.cos(angle - Math.PI / 2), tipY + len * Math.sin(angle - Math.PI / 2));
    ctx.stroke();
  }
  ctx.restore();
}

/** マルチ選択時のバウンディングボックス + リサイズハンドル */
export function drawBoundingBox(
  ctx: CanvasRenderingContext2D,
  selectedNodes: GraphNode[],
  scale: number,
): void {
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
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1 / scale;
  ctx.setLineDash([6 / scale, 4 / scale]);
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
  ctx.fillStyle = LABEL_BG_COLOR;
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1.5 / scale;
  for (const { hx, hy } of handles) {
    ctx.fillRect(hx - half, hy - half, hs, hs);
    ctx.strokeRect(hx - half, hy - half, hs, hs);
  }
  ctx.restore();
}

export function drawResizeHandles(
  ctx: CanvasRenderingContext2D,
  node: GraphNode,
  scale: number,
): void {
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
  ctx.fillStyle = LABEL_BG_COLOR;
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1.5 / scale;

  handles.forEach(({ hx, hy }) => {
    ctx.fillRect(hx - half, hy - half, handleSize, handleSize);
    ctx.strokeRect(hx - half, hy - half, handleSize, handleSize);
  });

  ctx.restore();
}

/** 選択中エッジの両端にドラッグ可能なハンドルを描画 */
export function drawEdgeEndpointHandles(
  ctx: CanvasRenderingContext2D,
  edge: GraphEdge & { waypoints?: { x: number; y: number }[] },
  scale: number,
): void {
  const r = 7 / scale;
  const pts = edge.waypoints && edge.waypoints.length >= 2
    ? [edge.waypoints[0], edge.waypoints[edge.waypoints.length - 1]]
    : [{ x: edge.from.x, y: edge.from.y }, { x: edge.to.x, y: edge.to.y }];

  ctx.save();
  for (const pt of pts) {
    // 外円
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
    ctx.fillStyle = SELECTION_COLOR;
    ctx.fill();
    // 内円
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = BG_COLOR;
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
): void {
  const { x, y, width: w, height: h } = node;
  const r = 6 / scale;
  const points = [
    { px: x + w / 2, py: y },
    { px: x + w, py: y + h / 2 },
    { px: x + w / 2, py: y + h },
    { px: x, py: y + h / 2 },
  ];

  // マウス座標が渡された場合、最も近い1点のみ表示
  let visiblePoints = points;
  if (mouseWX !== undefined && mouseWY !== undefined) {
    let best = points[0];
    let bestDist = Infinity;
    for (const p of points) {
      const d = Math.hypot(p.px - mouseWX, p.py - mouseWY);
      if (d < bestDist) { bestDist = d; best = p; }
    }
    visiblePoints = [best];
  }

  ctx.save();
  for (const { px, py } of visiblePoints) {
    // 外円
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = SELECTION_COLOR;
    ctx.fill();
    // 内円
    ctx.beginPath();
    ctx.arc(px, py, r * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = BG_COLOR;
    ctx.fill();
  }
  ctx.restore();
}

/** ドラッグ中のエッジプレビュー線を描画 */
export function drawEdgePreview(
  ctx: CanvasRenderingContext2D,
  fromX: number, fromY: number,
  toX: number, toY: number,
  edgeType: 'line' | 'arrow' | 'connector',
): void {
  ctx.save();
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.setLineDash([]);

  if (edgeType === 'arrow' || edgeType === 'connector') {
    drawArrowHead(ctx, fromX, fromY, toX, toY, SELECTION_COLOR);
  }
  ctx.restore();
}

const SNAP_HIGHLIGHT_COLOR = CANVAS_SNAP;
const SNAP_INDICATOR_RADIUS = 6;

/** スナップ対象ノードのハイライト枠を描画 */
export function drawSnapHighlight(
  ctx: CanvasRenderingContext2D,
  node: GraphNode,
): void {
  ctx.save();
  ctx.strokeStyle = SNAP_HIGHLIGHT_COLOR;
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
  ctx.fillStyle = SNAP_HIGHLIGHT_COLOR;
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
  ctx.fillStyle = CANVAS_SNAP_INNER;
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
  shapeType: 'rect' | 'ellipse' | 'sticky' | 'text' | 'diamond' | 'parallelogram' | 'cylinder' | 'insight' | 'doc',
): void {
  const x = Math.min(fromX, toX);
  const y = Math.min(fromY, toY);
  const w = Math.abs(toX - fromX);
  const h = Math.abs(toY - fromY);
  if (w < 2 && h < 2) return;

  ctx.save();
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.fillStyle = CANVAS_SELECTION_FILL;

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

export function drawSmartGuides(ctx: CanvasRenderingContext2D, guides: GuideLine[]): void {
  ctx.save();
  ctx.strokeStyle = CANVAS_SMART_GUIDE;
  ctx.lineWidth = 0.5;
  ctx.setLineDash([4, 4]);
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
): void {
  ctx.save();

  ctx.fillStyle = CANVAS_SELECTION_FILL;
  ctx.fillRect(x, y, width, height);

  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(x, y, width, height);
  ctx.setLineDash([]);

  ctx.restore();
}
