import type { ChartTheme, PlottedPoint, Rect, Series } from "../../types";
import { drawMarker, markerShape, seriesColor } from "./style";

/**
 * 散布図を描く。各系列の points を (xScale, yScale) で配置する。
 * 返り値は hit-test 用の描画済み点。
 */
export function drawScatterSeries(
  ctx: CanvasRenderingContext2D,
  _plot: Rect,
  series: Series,
  seriesIndex: number,
  theme: ChartTheme,
  xScale: (v: number) => number,
  yScale: (v: number) => number,
): PlottedPoint[] {
  const color = seriesColor(seriesIndex, series, theme);
  const shape = markerShape(seriesIndex);
  const pts = series.points ?? [];
  const out: PlottedPoint[] = [];

  ctx.save();
  ctx.fillStyle = color;
  pts.forEach((p, i) => {
    const cx = xScale(p.x);
    const cy = yScale(p.y);
    drawMarker(ctx, shape, cx, cy, 4);
    out.push({ seriesIndex, dataIndex: i, cx, cy, value: p.y });
  });
  ctx.restore();

  return out;
}
