import { GraphNode, GraphEdge, Viewport, SelectionState } from '../types';
import type { GuideLine } from './smartGuide';

const GRID_SIZE = 20;
const HANDLE_SIZE = 8;
const SELECTION_COLOR = '#2196f3';

export function render(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  nodes: GraphNode[],
  edges: GraphEdge[],
  viewport: Viewport,
  selection: SelectionState,
  showGrid: boolean,
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(viewport.offsetX, viewport.offsetY);
  ctx.scale(viewport.scale, viewport.scale);

  if (showGrid) drawGrid(ctx, viewport, width, height);

  edges.forEach(e => drawEdge(ctx, e, selection.edgeIds.includes(e.id)));
  nodes.forEach(n => drawNode(ctx, n, selection.nodeIds.includes(n.id)));
  nodes
    .filter(n => selection.nodeIds.includes(n.id))
    .forEach(n => drawResizeHandles(ctx, n, viewport.scale));

  ctx.restore();
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  width: number,
  height: number,
): void {
  ctx.save();
  ctx.strokeStyle = '#e0e0e0';
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

export function drawNode(
  ctx: CanvasRenderingContext2D,
  node: GraphNode,
  selected: boolean,
): void {
  ctx.save();

  const { x, y, width, height, type, style, text } = node;

  if (type === 'sticky') {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    ctx.fillStyle = style.fill;
    drawRoundedRect(ctx, x, y, width, height, 4);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = selected ? SELECTION_COLOR : style.stroke;
    ctx.lineWidth = selected ? 2 : style.strokeWidth;
    drawRoundedRect(ctx, x, y, width, height, 4);
    ctx.stroke();
  } else if (type === 'ellipse') {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const rx = width / 2;
    const ry = height / 2;

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = style.fill;
    ctx.fill();
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
    ctx.fillStyle = style.fill;
    drawDiamond(ctx, x, y, width, height);
    ctx.fill();
    ctx.strokeStyle = selected ? SELECTION_COLOR : style.stroke;
    ctx.lineWidth = selected ? 2 : style.strokeWidth;
    drawDiamond(ctx, x, y, width, height);
    ctx.stroke();
  } else if (type === 'parallelogram') {
    ctx.fillStyle = style.fill;
    drawParallelogram(ctx, x, y, width, height);
    ctx.fill();
    ctx.strokeStyle = selected ? SELECTION_COLOR : style.stroke;
    ctx.lineWidth = selected ? 2 : style.strokeWidth;
    drawParallelogram(ctx, x, y, width, height);
    ctx.stroke();
  } else if (type === 'cylinder') {
    ctx.fillStyle = style.fill;
    drawCylinderBody(ctx, x, y, width, height);
    ctx.fill();
    ctx.strokeStyle = selected ? SELECTION_COLOR : style.stroke;
    ctx.lineWidth = selected ? 2 : style.strokeWidth;
    drawCylinderBody(ctx, x, y, width, height);
    ctx.stroke();
    // Draw top ellipse on top (stroke only)
    ctx.strokeStyle = selected ? SELECTION_COLOR : style.stroke;
    ctx.lineWidth = selected ? 2 : style.strokeWidth;
    drawCylinderTop(ctx, x, y, width, height);
    ctx.stroke();
  } else {
    // rect
    ctx.fillStyle = style.fill;
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = selected ? SELECTION_COLOR : style.stroke;
    ctx.lineWidth = selected ? 2 : style.strokeWidth;
    ctx.strokeRect(x, y, width, height);
  }

  if (text) {
    ctx.fillStyle = '#333333';
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
  edge: GraphEdge,
  selected: boolean,
): void {
  ctx.save();

  const { from, to, style, type } = edge;

  ctx.strokeStyle = selected ? SELECTION_COLOR : style.stroke;
  ctx.lineWidth = selected ? style.strokeWidth + 1 : style.strokeWidth;

  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  if (type === 'arrow' || type === 'connector') {
    drawArrowHead(ctx, from.x, from.y, to.x, to.y, selected ? SELECTION_COLOR : style.stroke);
  }

  if (edge.label) {
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    ctx.fillStyle = '#ffffff';
    const labelMetrics = ctx.measureText(edge.label);
    const padding = 4;
    ctx.fillRect(
      midX - labelMetrics.width / 2 - padding,
      midY - 8 - padding,
      labelMetrics.width + padding * 2,
      16 + padding * 2,
    );
    ctx.fillStyle = '#333333';
    ctx.font = '12px sans-serif';
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
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1.5 / scale;

  handles.forEach(({ hx, hy }) => {
    ctx.fillRect(hx - half, hy - half, handleSize, handleSize);
    ctx.strokeRect(hx - half, hy - half, handleSize, handleSize);
  });

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

const SNAP_HIGHLIGHT_COLOR = '#4caf50';
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
  // 白い内円
  ctx.fillStyle = '#ffffff';
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
  shapeType: 'rect' | 'ellipse' | 'sticky' | 'text' | 'diamond' | 'parallelogram' | 'cylinder',
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
  ctx.fillStyle = 'rgba(33, 150, 243, 0.05)';

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
  ctx.strokeStyle = '#f44336';
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

  ctx.fillStyle = 'rgba(33, 150, 243, 0.1)';
  ctx.fillRect(x, y, width, height);

  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(x, y, width, height);
  ctx.setLineDash([]);

  ctx.restore();
}
