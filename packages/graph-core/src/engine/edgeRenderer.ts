import { GraphEdge, EndpointShape } from '../types';
import {
  CANVAS_BG, CANVAS_SELECTION, COLOR_TEXT_SECONDARY, FONT_FAMILY,
} from '../theme';

export function drawEdge(
  ctx: CanvasRenderingContext2D,
  edge: GraphEdge,
  selected: boolean,
): void {
  ctx.save();

  const { from, to, style, type } = edge;

  ctx.strokeStyle = selected ? CANVAS_SELECTION : style.stroke;
  ctx.lineWidth = selected ? style.strokeWidth + 1 : style.strokeWidth;

  const color = selected ? CANVAS_SELECTION : style.stroke;
  // 端点形状（未設定の場合、arrow/connectorタイプは endShape='arrow' をデフォルトにする）
  const startShape: EndpointShape = style.startShape ?? 'none';
  const endShape: EndpointShape = style.endShape ?? ((type === 'arrow' || type === 'connector') ? 'arrow' : 'none');

  // ベジェ曲線パスの描画
  if (edge.bezierPath && edge.bezierPath.length === 4) {
    const [start, cp1, cp2, end] = edge.bezierPath;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
    ctx.stroke();

    // 端点形状: ベジェ曲線の接線方向を使用
    drawEndpointShape(ctx, startShape, start.x, start.y, cp1.x, cp1.y, color);
    drawEndpointShape(ctx, endShape, end.x, end.y, cp2.x, cp2.y, color);

    // ラベル（t=0.5のベジェ曲線上の点）
    if (edge.label) {
      const t = 0.5;
      const mt = 1 - t;
      const labelX = mt*mt*mt*start.x + 3*mt*mt*t*cp1.x + 3*mt*t*t*cp2.x + t*t*t*end.x;
      const labelY = mt*mt*mt*start.y + 3*mt*mt*t*cp1.y + 3*mt*t*t*cp2.y + t*t*t*end.y;
      drawEdgeLabel(ctx, edge.label, labelX, labelY);
    }
  } else if (edge.waypoints && edge.waypoints.length >= 2) {
    // 既存の直交パス描画
    ctx.beginPath();
    ctx.moveTo(edge.waypoints[0].x, edge.waypoints[0].y);
    for (let i = 1; i < edge.waypoints.length; i++) {
      ctx.lineTo(edge.waypoints[i].x, edge.waypoints[i].y);
    }
    ctx.stroke();
    const first = edge.waypoints[0];
    const second = edge.waypoints[1];
    const last = edge.waypoints[edge.waypoints.length - 1];
    const prev = edge.waypoints[edge.waypoints.length - 2];
    drawEndpointShape(ctx, startShape, first.x, first.y, second.x, second.y, color);
    drawEndpointShape(ctx, endShape, last.x, last.y, prev.x, prev.y, color);

    // ラベル（waypointsのパス中点に描画）
    if (edge.label) {
      const midIdx = Math.floor(edge.waypoints.length / 2);
      const midPt = edge.waypoints[midIdx];
      const prevPt = edge.waypoints[midIdx - 1] ?? midPt;
      const labelX = (midPt.x + prevPt.x) / 2;
      const labelY = (midPt.y + prevPt.y) / 2;
      drawEdgeLabel(ctx, edge.label, labelX, labelY);
    }
  } else {
    // 直線描画
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    drawEndpointShape(ctx, startShape, from.x, from.y, to.x, to.y, color);
    drawEndpointShape(ctx, endShape, to.x, to.y, from.x, from.y, color);

    if (edge.label) {
      const labelX = (from.x + to.x) / 2;
      const labelY = (from.y + to.y) / 2;
      drawEdgeLabel(ctx, edge.label, labelX, labelY);
    }
  }

  ctx.restore();
}

/** エッジラベルを背景付きで描画 */
function drawEdgeLabel(ctx: CanvasRenderingContext2D, label: string, x: number, y: number): void {
  ctx.save();
  ctx.font = `12px ${FONT_FAMILY}`;
  const metrics = ctx.measureText(label);
  const padding = 4;
  ctx.fillStyle = CANVAS_BG;
  ctx.fillRect(
    x - metrics.width / 2 - padding,
    y - 8 - padding,
    metrics.width + padding * 2,
    16 + padding * 2,
  );
  ctx.fillStyle = COLOR_TEXT_SECONDARY;
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

/** 無効なドロップターゲットの色 */
const COLOR_INVALID_TARGET = 'rgba(244, 67, 54, 0.6)';

/** ドラッグ中のエッジプレビュー線を描画 */
export function drawEdgePreview(
  ctx: CanvasRenderingContext2D,
  fromX: number, fromY: number,
  toX: number, toY: number,
  edgeType: 'line' | 'arrow' | 'connector',
  isValid: boolean = true,
): void {
  const color = isValid ? CANVAS_SELECTION : COLOR_INVALID_TARGET;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.setLineDash([]);

  if (edgeType === 'arrow' || edgeType === 'connector') {
    drawArrowHead(ctx, fromX, fromY, toX, toY, color);
  }
  ctx.restore();
}
