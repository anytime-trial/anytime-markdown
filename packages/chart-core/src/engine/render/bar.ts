import type { ChartTheme, PlottedPoint, Rect, Series } from "../../types";
import { seriesColor } from "./style";

/** カテゴリ内バンド幅に対する棒群の占有率（残りが隙間）。 */
const BAND_FILL = 0.7;

/**
 * 棒グラフを描く。単純（1系列）・集合（grouped）・積み上げ（stacked）に対応。
 * 棒間に隙間を空ける（ガイドブック）。返り値は各棒頂点（hit-test 用）。
 */
export function drawBars(
  ctx: CanvasRenderingContext2D,
  plot: Rect,
  seriesList: ReadonlyArray<Series>,
  theme: ChartTheme,
  yScale: (v: number) => number,
  options: { stacked?: boolean; grouped?: boolean },
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
