import type { ChartTheme, PlottedPoint, Rect, Series } from "../../types";
import { seriesColor } from "./style";

/**
 * near-line 凡例: 各系列の最終データ点の近傍（線末右）に系列名を置く（ガイドブック推奨）。
 */
export function drawNearLineLabels(
  ctx: CanvasRenderingContext2D,
  seriesList: ReadonlyArray<Series>,
  pointsBySeries: ReadonlyArray<ReadonlyArray<PlottedPoint>>,
  theme: ChartTheme,
): void {
  ctx.save();
  ctx.font = "11px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  seriesList.forEach((series, si) => {
    const pts = pointsBySeries[si];
    const last = pts?.at(-1);
    if (!last) return;
    ctx.fillStyle = seriesColor(si, series, theme);
    ctx.fillText(series.name, last.cx + 6, last.cy);
  });
  ctx.restore();
}

/**
 * adjacent 凡例: 右側にマーカー + 系列名を縦に並べる（グラフと隣接・順序対応）。
 */
export function drawAdjacentLegend(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  plot: Rect,
  seriesList: ReadonlyArray<Series>,
  theme: ChartTheme,
  rightOffset = 0,
): void {
  ctx.save();
  ctx.font = "11px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  // rightOffset: 右軸ラベルぶん凡例を右へずらし重なりを避ける。
  const x = plot.x + plot.width + 12 + rightOffset;
  const lineH = 18;
  const startY = plot.y + 4;
  seriesList.forEach((series, si) => {
    const y = startY + lineH * si;
    if (y > rect.y + rect.height) return;
    ctx.fillStyle = seriesColor(si, series, theme);
    ctx.fillRect(x, y - 4, 10, 8);
    ctx.fillStyle = theme.palette.text;
    ctx.fillText(series.name, x + 16, y);
  });
  ctx.restore();
}
