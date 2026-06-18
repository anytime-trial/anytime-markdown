import type { ChartLayout, ChartSpec, ChartTheme, PlottedPoint, Rect, Series } from "../types";
import { computePlotRect } from "./layout";
import { linearScale, niceTicks } from "./scales";
import { drawAxes, drawAxesHorizontal, drawTitle } from "./render/axes";
import { drawLineSeries } from "./render/line";
import { drawBars } from "./render/bar";
import { drawScatterSeries } from "./render/scatter";
import { drawAreaSeries } from "./render/area";
import { drawPie } from "./render/pie";
import { drawAdjacentLegend, drawNearLineLabels } from "./render/legend";

function finiteValues(spec: ChartSpec): number[] {
  const out: number[] = [];
  for (const s of spec.series) {
    for (const v of s.values ?? []) if (v != null && Number.isFinite(v)) out.push(v);
    for (const p of s.points ?? []) if (Number.isFinite(p.y)) out.push(p.y);
  }
  return out;
}

function stackedMax(spec: ChartSpec): number {
  const count = Math.max(0, ...spec.series.map((s) => (s.values ?? []).length));
  let max = 0;
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (const s of spec.series) {
      const v = (s.values ?? [])[i];
      if (v != null && Number.isFinite(v)) sum += v;
    }
    max = Math.max(max, sum);
  }
  return max;
}

function scatterXBounds(spec: ChartSpec): [number, number] {
  const xs: number[] = [];
  for (const s of spec.series) for (const p of s.points ?? []) if (Number.isFinite(p.x)) xs.push(p.x);
  if (xs.length === 0) return [0, 1];
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const pad = (max - min || 1) * 0.05;
  return [min - pad, max + pad];
}

/**
 * spec を rect 内に描画し、hit-test 用レイアウトを返す純粋関数（副作用は ctx 描画のみ）。
 * 軸は原点 0 固定（zeroBaseline 既定 true）、水平グリッドのみ、3D/影なし。
 */
export function renderChart(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  spec: ChartSpec,
  theme: ChartTheme,
): ChartLayout {
  const legend = spec.options?.legend ?? "near-line";
  const hasTitle = Boolean(spec.title);
  const plot = computePlotRect(rect, { hasTitle, legend });

  // 背景
  ctx.save();
  ctx.fillStyle = theme.palette.background;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();

  // pie は直交軸を使わないため専用分岐（軸・スケールをスキップ）。
  if (spec.kind === "pie") {
    const piePoints = drawPie(ctx, plot, spec, theme, { donut: spec.options?.donut });
    if (spec.title) drawTitle(ctx, rect, spec.title, theme);
    return { spec, plotRect: plot, points: piePoints };
  }

  // 横棒は数量軸＝x・分類軸＝y で軸が入れ替わるため専用分岐。
  if (spec.kind === "bar" && spec.options?.horizontal) {
    const hStacked = Boolean(spec.options?.stacked) && !spec.options?.grouped;
    const xMaxData = hStacked ? stackedMax(spec) : Math.max(0, ...finiteValues(spec));
    const hTicks = niceTicks(0, xMaxData, 5);
    const xTop = hTicks.at(-1) ?? 1;
    const xScale = linearScale([0, xTop], [plot.x, plot.x + plot.width]);
    const catCount = Math.max(1, ...spec.series.map((s) => (s.values ?? []).length), spec.categories?.length ?? 0);
    const catLabels = Array.from({ length: catCount }, (_, i) => spec.categories?.[i] ?? "");
    drawAxesHorizontal(ctx, plot, hTicks, xScale, catLabels, theme);
    const bp = drawBars(ctx, plot, spec.series, theme, xScale, {
      stacked: spec.options?.stacked,
      grouped: spec.options?.grouped,
      horizontal: true,
    });
    if (legend === "adjacent" || spec.series.length > 1) {
      drawAdjacentLegend(ctx, rect, plot, spec.series, theme);
    }
    if (spec.title) drawTitle(ctx, rect, spec.title, theme);
    return { spec, plotRect: plot, points: bp };
  }

  const stacked = Boolean(spec.options?.stacked) && (spec.kind === "bar" || spec.kind === "area");
  const yMaxData = stacked ? stackedMax(spec) : Math.max(0, ...finiteValues(spec));
  const ticks = niceTicks(0, yMaxData, 5);
  const yTop = ticks.at(-1) ?? 1;
  const yScale = linearScale([0, yTop], [plot.y + plot.height, plot.y]);

  // line/bar の x 軸分割数は「カテゴリ数」と「系列の最大値数」の大きい方に統一する。
  // これによりカテゴリ数と値数が食い違っても x ラベルとデータ点の整列が崩れない。
  const lineBarCount =
    spec.kind === "scatter"
      ? 0
      : Math.max(spec.categories?.length ?? 0, ...spec.series.map((s) => (s.values ?? []).length), 1);
  const xLabels =
    spec.kind === "scatter"
      ? []
      : Array.from({ length: lineBarCount }, (_, i) => spec.categories?.[i] ?? "");
  drawAxes(ctx, plot, ticks, yScale, xLabels, theme);

  // 参照値帯
  const band = spec.options?.referenceBand;
  if (band) {
    ctx.save();
    ctx.fillStyle = theme.palette.grid;
    ctx.globalAlpha = 0.4;
    const y0 = yScale(band.to);
    const y1 = yScale(band.from);
    ctx.fillRect(plot.x, Math.min(y0, y1), plot.width, Math.abs(y1 - y0));
    ctx.restore();
  }

  const points: PlottedPoint[] = [];
  const pointsBySeries: PlottedPoint[][] = [];

  if (spec.kind === "bar") {
    const bp = drawBars(ctx, plot, spec.series, theme, yScale, {
      stacked: spec.options?.stacked,
      grouped: spec.options?.grouped,
    });
    points.push(...bp);
    spec.series.forEach((_, si) => pointsBySeries.push(bp.filter((p) => p.seriesIndex === si)));
  } else if (spec.kind === "scatter") {
    const [xMin, xMax] = scatterXBounds(spec);
    const xScale = linearScale([xMin, xMax], [plot.x, plot.x + plot.width]);
    spec.series.forEach((series, si) => {
      const sp = drawScatterSeries(ctx, plot, series, si, theme, xScale, yScale);
      points.push(...sp);
      pointsBySeries.push(sp);
    });
  } else if (spec.kind === "combo") {
    // bar 系列（集合）を描いた上に line 系列を重ねる。色は元の系列インデックスで一貫させる。
    const bandW = plot.width / lineBarCount;
    const categoryX = (i: number) => plot.x + bandW * (i + 0.5);
    const barEntries: { s: Series; i: number }[] = [];
    const lineEntries: { s: Series; i: number }[] = [];
    spec.series.forEach((s, i) => {
      const colored: Series = s.color ? s : { ...s, color: theme.palette.series[i % theme.palette.series.length] };
      if ((s.type ?? "bar") === "line") lineEntries.push({ s: colored, i });
      else barEntries.push({ s: colored, i });
    });
    const bp = drawBars(ctx, plot, barEntries.map((e) => e.s), theme, yScale, { grouped: true });
    for (const p of bp) points.push({ ...p, seriesIndex: barEntries[p.seriesIndex]?.i ?? p.seriesIndex });
    for (const e of lineEntries) {
      const lp = drawLineSeries(ctx, plot, e.s, e.i, theme, yScale, categoryX);
      points.push(...lp);
    }
  } else {
    const bandW = plot.width / lineBarCount;
    const categoryX = (i: number) => plot.x + bandW * (i + 0.5);
    if (spec.kind === "area") {
      const ap = drawAreaSeries(ctx, plot, spec.series, theme, yScale, categoryX, { stacked });
      points.push(...ap);
      spec.series.forEach((_, si) => pointsBySeries.push(ap.filter((p) => p.seriesIndex === si)));
    } else {
      spec.series.forEach((series, si) => {
        const lp = drawLineSeries(ctx, plot, series, si, theme, yScale, categoryX);
        points.push(...lp);
        pointsBySeries.push(lp);
      });
    }
  }

  // combo は bar+line 混在のため隣接凡例（near-line は line 端のみで bar を表せない）。
  const legendMode = spec.kind === "combo" && legend !== "none" ? "adjacent" : legend;
  if (legendMode === "near-line") drawNearLineLabels(ctx, spec.series, pointsBySeries, theme);
  else if (legendMode === "adjacent") drawAdjacentLegend(ctx, rect, plot, spec.series, theme);

  if (spec.title) drawTitle(ctx, rect, spec.title, theme);

  return { spec, plotRect: plot, points };
}
