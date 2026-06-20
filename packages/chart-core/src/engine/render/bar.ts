import type { ChartTheme, PlottedPoint, Rect, Series } from "../../types";
import { seriesColor } from "./style";

/** カテゴリ内バンド幅に対する棒群の占有率（残りが隙間）。 */
const BAND_FILL = 0.7;

export interface BarOptions {
  stacked?: boolean;
  grouped?: boolean;
  /** 横棒（数量軸＝x、分類軸＝y）。 */
  horizontal?: boolean;
}

/**
 * 棒グラフを描く。単純・集合(grouped)・積み上げ(stacked)・横棒(horizontal)に対応。
 * `valueScale` は数量→ピクセル（縦棒は y、横棒は x）。返り値は各棒の値端の点（hit-test 用）。
 */
export function drawBars(
  ctx: CanvasRenderingContext2D,
  plot: Rect,
  seriesList: ReadonlyArray<Series>,
  theme: ChartTheme,
  valueScale: (v: number) => number,
  options: BarOptions,
): PlottedPoint[] {
  return options.horizontal
    ? drawBarsHorizontal(ctx, plot, seriesList, theme, valueScale, options)
    : drawBarsVertical(ctx, plot, seriesList, theme, valueScale, options);
}

function drawBarsVertical(
  ctx: CanvasRenderingContext2D,
  plot: Rect,
  seriesList: ReadonlyArray<Series>,
  theme: ChartTheme,
  yScale: (v: number) => number,
  options: BarOptions,
): PlottedPoint[] {
  const categoryCount = Math.max(1, ...seriesList.map((s) => (s.values ?? []).length));
  const band = plot.width / categoryCount;
  const groupWidth = band * BAND_FILL;
  const baseline = yScale(0);
  const points: PlottedPoint[] = [];
  const stacked = options.stacked && !options.grouped;

  for (let ci = 0; ci < categoryCount; ci++) {
    const groupLeft = plot.x + band * ci + (band - groupWidth) / 2;
    let stackTop = baseline;

    seriesList.forEach((series, si) => {
      const v = (series.values ?? [])[ci];
      if (v == null || !Number.isFinite(v)) return;
      ctx.save();
      ctx.fillStyle = seriesColor(si, series, theme);

      let x: number;
      let w: number;
      let top: number;
      let h: number;
      if (stacked) {
        const top0 = yScale(v) - (baseline - stackTop);
        x = groupLeft;
        w = groupWidth;
        top = top0;
        h = baseline - yScale(v);
        stackTop = top0;
      } else {
        const subW = groupWidth / seriesList.length;
        x = groupLeft + subW * si;
        w = subW;
        top = Math.min(baseline, yScale(v));
        h = Math.abs(baseline - yScale(v));
      }
      ctx.fillRect(x, top, w, h);
      ctx.restore();
      points.push({ seriesIndex: si, dataIndex: ci, cx: x + w / 2, cy: top, value: v });
    });
  }
  return points;
}

function drawBarsHorizontal(
  ctx: CanvasRenderingContext2D,
  plot: Rect,
  seriesList: ReadonlyArray<Series>,
  theme: ChartTheme,
  xScale: (v: number) => number,
  options: BarOptions,
): PlottedPoint[] {
  const categoryCount = Math.max(1, ...seriesList.map((s) => (s.values ?? []).length));
  const band = plot.height / categoryCount;
  const groupThick = band * BAND_FILL;
  const baseline = xScale(0);
  const points: PlottedPoint[] = [];
  const stacked = options.stacked && !options.grouped;

  for (let ci = 0; ci < categoryCount; ci++) {
    const groupTop = plot.y + band * ci + (band - groupThick) / 2;
    let stackLeft = baseline;

    seriesList.forEach((series, si) => {
      const v = (series.values ?? [])[ci];
      if (v == null || !Number.isFinite(v)) return;
      ctx.save();
      ctx.fillStyle = seriesColor(si, series, theme);

      let x: number;
      let y: number;
      let w: number;
      let h: number;
      if (stacked) {
        const width = xScale(v) - baseline;
        x = stackLeft;
        w = width;
        y = groupTop;
        h = groupThick;
        stackLeft += width;
      } else {
        const subH = groupThick / seriesList.length;
        y = groupTop + subH * si;
        h = subH;
        x = Math.min(baseline, xScale(v));
        w = Math.abs(xScale(v) - baseline);
      }
      ctx.fillRect(x, y, w, h);
      ctx.restore();
      points.push({ seriesIndex: si, dataIndex: ci, cx: x + w, cy: y + h / 2, value: v });
    });
  }
  return points;
}
