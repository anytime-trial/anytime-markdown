/**
 * Canvas 2D 描画ヘルパー
 *
 * overlays.ts 等で繰り返し使われる基本描画パターンを集約する。
 */

/** 塗りつぶし＋ストロークの円を描画 */
export function drawCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string,
  stroke?: string,
  lineWidth?: number,
): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    if (lineWidth !== undefined) ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

/** 塗りつぶし＋ストロークの矩形ハンドルを描画 */
export function drawHandle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  fill: string,
  stroke: string,
  lineWidth?: number,
): void {
  const half = size / 2;
  ctx.fillStyle = fill;
  ctx.fillRect(x - half, y - half, size, size);
  ctx.strokeStyle = stroke;
  if (lineWidth !== undefined) ctx.lineWidth = lineWidth;
  ctx.strokeRect(x - half, y - half, size, size);
}
