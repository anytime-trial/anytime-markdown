import { GraphEdge, EndpointShape } from '../types';
import { CanvasColors, getCanvasColors, FONT_FAMILY } from '../theme';
import {
  FONT_SIZE_EDGE_LABEL, DASH_OVERLAY,
  ARROW_HEAD_LENGTH, ENDPOINT_CIRCLE_RADIUS, ENDPOINT_DIAMOND_SIZE, ENDPOINT_BAR_LENGTH,
} from './constants';

export function drawEdge(
  ctx: CanvasRenderingContext2D,
  edge: GraphEdge,
  selected: boolean,
  colors?: CanvasColors,
): void {
  const c = colors ?? getCanvasColors(true);
  ctx.save();

  const { style, type } = edge;

  ctx.strokeStyle = selected ? c.canvasSelection : style.stroke;
  ctx.lineWidth = selected ? style.strokeWidth + 1 : style.strokeWidth;

  const color = selected ? c.canvasSelection : style.stroke;
  const startShape: EndpointShape = style.startShape ?? 'none';
  const endShape: EndpointShape = style.endShape ?? (type === 'connector' ? 'arrow' : 'none');

  const labelPos = drawEdgePath(ctx, edge, startShape, endShape, color);

  if (edge.label && labelPos) {
    drawEdgeLabel(ctx, edge.label, labelPos.x, labelPos.y, c);
  }

  if (selected && edge.manualWaypoints) {
    drawManualWaypointHandles(ctx, edge.manualWaypoints, c);
  }

  ctx.restore();
}

interface Point { readonly x: number; readonly y: number }

/** 描画モードに応じたパスを描画し、ラベル位置を返す */
function drawEdgePath(
  ctx: CanvasRenderingContext2D,
  edge: GraphEdge,
  startShape: EndpointShape,
  endShape: EndpointShape,
  color: string,
): Point | undefined {
  if (edge.bezierPath?.length === 4) {
    return drawBezierEdge(ctx, edge.bezierPath, startShape, endShape, color);
  }
  if (edge.waypoints && edge.waypoints.length >= 2) {
    return drawWaypointEdge(ctx, edge.waypoints, startShape, endShape, color);
  }
  return drawStraightEdge(ctx, edge.from, edge.to, startShape, endShape, color);
}

/** ベジェ曲線パスを描画し、t=0.5 のラベル位置を返す */
function drawBezierEdge(
  ctx: CanvasRenderingContext2D,
  bezierPath: readonly Point[],
  startShape: EndpointShape,
  endShape: EndpointShape,
  color: string,
): Point {
  const [start, cp1, cp2, end] = bezierPath;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
  ctx.stroke();

  drawEndpointShape(ctx, startShape, start.x, start.y, cp1.x, cp1.y, color);
  drawEndpointShape(ctx, endShape, end.x, end.y, cp2.x, cp2.y, color);

  const t = 0.5;
  const mt = 1 - t;
  return {
    x: mt*mt*mt*start.x + 3*mt*mt*t*cp1.x + 3*mt*t*t*cp2.x + t*t*t*end.x,
    y: mt*mt*mt*start.y + 3*mt*mt*t*cp1.y + 3*mt*t*t*cp2.y + t*t*t*end.y,
  };
}

/** ウェイポイントパスを描画し、パス中点のラベル位置を返す */
function drawWaypointEdge(
  ctx: CanvasRenderingContext2D,
  waypoints: readonly Point[],
  startShape: EndpointShape,
  endShape: EndpointShape,
  color: string,
): Point {
  ctx.beginPath();
  ctx.moveTo(waypoints[0].x, waypoints[0].y);
  for (let i = 1; i < waypoints.length; i++) {
    ctx.lineTo(waypoints[i].x, waypoints[i].y);
  }
  ctx.stroke();

  const first = waypoints[0];
  const second = waypoints[1];
  const last = waypoints.at(-1)!;
  const prev = waypoints.at(-2)!;
  drawEndpointShape(ctx, startShape, first.x, first.y, second.x, second.y, color);
  drawEndpointShape(ctx, endShape, last.x, last.y, prev.x, prev.y, color);

  const midIdx = Math.floor(waypoints.length / 2);
  const midPt = waypoints[midIdx];
  const prevPt = waypoints[midIdx - 1] ?? midPt;
  return { x: (midPt.x + prevPt.x) / 2, y: (midPt.y + prevPt.y) / 2 };
}

/** 直線パスを描画し、中点のラベル位置を返す */
function drawStraightEdge(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  startShape: EndpointShape,
  endShape: EndpointShape,
  color: string,
): Point {
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  drawEndpointShape(ctx, startShape, from.x, from.y, to.x, to.y, color);
  drawEndpointShape(ctx, endShape, to.x, to.y, from.x, from.y, color);
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
}

/** 選択時の manualWaypoints ハンドルを描画 */
function drawManualWaypointHandles(
  ctx: CanvasRenderingContext2D,
  manualWaypoints: readonly Point[],
  c: CanvasColors,
): void {
  const wpSize = 4;
  for (const wp of manualWaypoints) {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = c.canvasSelection;
    ctx.lineWidth = 1.5;
    ctx.fillRect(wp.x - wpSize, wp.y - wpSize, wpSize * 2, wpSize * 2);
    ctx.strokeRect(wp.x - wpSize, wp.y - wpSize, wpSize * 2, wpSize * 2);
  }
}

/** エッジラベルを背景付きで描画 */
function drawEdgeLabel(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, colors?: CanvasColors): void {
  const c = colors ?? getCanvasColors(true);
  ctx.save();
  ctx.font = `${FONT_SIZE_EDGE_LABEL}px ${FONT_FAMILY}`;
  const metrics = ctx.measureText(label);
  const padding = 4;
  ctx.fillStyle = c.edgeLabelBg;
  ctx.fillRect(
    x - metrics.width / 2 - padding,
    y - 8 - padding,
    metrics.width + padding * 2,
    16 + padding * 2,
  );
  ctx.fillStyle = c.textSecondary;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y);
  ctx.restore();
}

export function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
  _colors?: CanvasColors,
): void {
  const headLength = ARROW_HEAD_LENGTH;
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
    const len = ARROW_HEAD_LENGTH;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - len * Math.cos(angle - Math.PI / 6), tipY - len * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(tipX - len * Math.cos(angle + Math.PI / 6), tipY - len * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  } else if (shape === 'circle') {
    const r = ENDPOINT_CIRCLE_RADIUS;
    ctx.beginPath();
    ctx.arc(tipX - r * Math.cos(angle), tipY - r * Math.sin(angle), r, 0, Math.PI * 2);
    ctx.fill();
  } else if (shape === 'diamond') {
    const s = ENDPOINT_DIAMOND_SIZE;
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
    const len = ENDPOINT_BAR_LENGTH;
    ctx.beginPath();
    ctx.moveTo(tipX - len * Math.cos(angle - Math.PI / 2), tipY - len * Math.sin(angle - Math.PI / 2));
    ctx.lineTo(tipX + len * Math.cos(angle - Math.PI / 2), tipY + len * Math.sin(angle - Math.PI / 2));
    ctx.stroke();
  }
  ctx.restore();
}

/** ドラッグ中のエッジプレビュー線を描画 */
export function drawEdgePreview(
  ctx: CanvasRenderingContext2D,
  fromX: number, fromY: number,
  toX: number, toY: number,
  edgeType: 'line' | 'connector',
  isValid: boolean = true,
  colors?: CanvasColors,
): void {
  const c = colors ?? getCanvasColors(true);
  const color = isValid ? c.canvasSelection : c.invalidTarget;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([...DASH_OVERLAY]);
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.setLineDash([]);

  if (edgeType === 'connector') {
    drawArrowHead(ctx, fromX, fromY, toX, toY, color);
  }
  ctx.restore();
}
