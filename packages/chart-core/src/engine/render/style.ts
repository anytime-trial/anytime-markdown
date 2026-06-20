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

/** 数値を簡潔に整形。1万以上は k、100万以上は M に短縮し軸ラベル/ツールチップの可読性を保つ。 */
export function formatValue(v: number): string {
  if (!Number.isFinite(v)) return "";
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 10_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return v.toLocaleString("en-US");
}
