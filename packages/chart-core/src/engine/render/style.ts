import type { ChartTheme, Series } from "../../types";

/** マーカー形状（色のみに依存しない識別のため系列ごとに変える）。 */
export type MarkerShape = "circle" | "square" | "triangle" | "diamond";

const SHAPES: readonly MarkerShape[] = ["circle", "square", "triangle", "diamond"];

export function markerShape(seriesIndex: number): MarkerShape {
  return SHAPES[seriesIndex % SHAPES.length];
}

/** 系列色を決める。明示 color > 非強調(muted) > パレット割当。 */
export function seriesColor(seriesIndex: number, series: Series, theme: ChartTheme): string {
  if (series.color) return series.color;
  if (series.emphasized === false) return theme.palette.muted;
  const palette = theme.palette.series;
  return palette[seriesIndex % palette.length];
}

/** 指定座標にマーカーを描く（半径 r）。 */
export function drawMarker(
  ctx: CanvasRenderingContext2D,
  shape: MarkerShape,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.beginPath();
  if (shape === "circle") {
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  } else if (shape === "square") {
    ctx.rect(cx - r, cy - r, r * 2, r * 2);
  } else if (shape === "triangle") {
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy + r);
    ctx.lineTo(cx - r, cy + r);
    ctx.closePath();
  } else {
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
  }
  ctx.fill();
}

/** 数値を簡潔に整形（桁区切り）。 */
export function formatValue(v: number): string {
  if (!Number.isFinite(v)) return "";
  return v.toLocaleString("en-US");
}
