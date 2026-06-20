import type { ChartTheme, PlottedPoint, Rect, Series } from "../../types";
import { drawMarker, markerShape, seriesColor } from "./style";

/**
 * 折れ線 1 系列を描き、データ点マーカーを置く。
 * dashed=true は破線（目標値などに使用）。返り値は hit-test 用の描画済み点。
 */
export function drawLineSeries(
  ctx: CanvasRenderingContext2D,
  plot: Rect,
  series: Series,
  seriesIndex: number,
  theme: ChartTheme,
  yScale: (v: number) => number,
  categoryX: (i: number) => number,
): PlottedPoint[] {
  const color = seriesColor(seriesIndex, series, theme);
  const shape = markerShape(seriesIndex);
  const values = series.values ?? [];
  const points: PlottedPoint[] = [];

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash(series.dashed ? [6, 4] : []);

  ctx.beginPath();
  let started = false;
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) {
      // connectNulls=true は欠損を跨いで前後の有効点を連結する（線を切らない）。
      if (!series.connectNulls) started = false;
      return;
    }
    const cx = categoryX(i);
    const cy = yScale(v);
    if (started) ctx.lineTo(cx, cy);
    else ctx.moveTo(cx, cy);
    started = true;
    points.push({ seriesIndex, dataIndex: i, cx, cy, value: v });
  });
  ctx.stroke();
  ctx.setLineDash([]);

  // マーカー
  for (const p of points) drawMarker(ctx, shape, p.cx, p.cy, 3.5);
  ctx.restore();

  return points;
}
