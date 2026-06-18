import type { ChartTheme, PlottedPoint, Rect, Series } from "../../types";
import { drawMarker, markerShape, seriesColor } from "./style";

/** 値を数値化（area は連続量とみなし null は 0 扱いで帯を途切れさせない）。 */
function val(v: number | null | undefined): number {
  return v == null || !Number.isFinite(v) ? 0 : v;
}

/**
 * 面グラフを描く。折れ線に baseline までの塗りを加える。
 * options.stacked で積み上げ面（各系列が下の累積の上に乗る）。未指定は半透明の重ね塗り。
 * 返り値は hit-test 用の描画済み点（各系列の上端）。
 */
export function drawAreaSeries(
  ctx: CanvasRenderingContext2D,
  plot: Rect,
  seriesList: ReadonlyArray<Series>,
  theme: ChartTheme,
  yScale: (v: number) => number,
  categoryX: (i: number) => number,
  options: { stacked?: boolean },
): PlottedPoint[] {
  const categoryCount = Math.max(0, ...seriesList.map((s) => (s.values ?? []).length));
  const lower = new Array<number>(categoryCount).fill(0);
  const points: PlottedPoint[] = [];

  seriesList.forEach((series, si) => {
    const color = seriesColor(si, series, theme);
    const shape = markerShape(si);
    const values = series.values ?? [];
    const top: { cx: number; cy: number; baseY: number; value: number; i: number; missing: boolean }[] = [];
    for (let i = 0; i < categoryCount; i++) {
      const raw = values[i];
      const missing = raw == null || !Number.isFinite(raw);
      const v = val(raw);
      const base = options.stacked ? lower[i] : 0;
      const cx = categoryX(i);
      // 塗りの連続性のため欠損は 0 として座標計算するが、マーカー/hit-test 点は生成しない。
      top.push({ cx, cy: yScale(base + v), baseY: yScale(base), value: v, i, missing });
      if (options.stacked) lower[i] = base + v;
    }
    if (top.length === 0) return;

    // 塗り（上端 → baseline を閉じてフィル）
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(top[0].cx, top[0].cy);
    for (let i = 1; i < top.length; i++) ctx.lineTo(top[i].cx, top[i].cy);
    for (let i = top.length - 1; i >= 0; i--) ctx.lineTo(top[i].cx, top[i].baseY);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // 上端の線
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash(series.dashed ? [6, 4] : []);
    ctx.beginPath();
    top.forEach((p, i) => (i === 0 ? ctx.moveTo(p.cx, p.cy) : ctx.lineTo(p.cx, p.cy)));
    ctx.stroke();
    ctx.setLineDash([]);

    // マーカー（欠損カテゴリには描かない）
    ctx.fillStyle = color;
    for (const p of top) if (!p.missing) drawMarker(ctx, shape, p.cx, p.cy, 3.5);
    ctx.restore();

    // hit-test 点も欠損を除外（line と同様、欠損を実測 0 として扱わない）。
    for (const p of top) {
      if (p.missing) continue;
      points.push({ seriesIndex: si, dataIndex: p.i, cx: p.cx, cy: p.cy, value: p.value });
    }
  });

  return points;
}
