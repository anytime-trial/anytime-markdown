import type { ChartLayout, ChartSpec, ChartTheme, PlottedPoint, Rect, Series } from "../types";
import { computePlotRect } from "./layout";
import { linearScale, niceTicks } from "./scales";
import { drawAxes, drawAxesHorizontal, drawRightAxis, drawTitle } from "./render/axes";
import { drawLineSeries } from "./render/line";
import { drawBars } from "./render/bar";
import { drawScatterSeries } from "./render/scatter";
import { drawAreaSeries } from "./render/area";
import { drawPie } from "./render/pie";
import { drawMarkers } from "./render/markers";
import {
  BOTTOM_LEGEND_PAD,
  BOTTOM_LEGEND_ROW_H,
  drawAdjacentLegend,
  drawBottomLegend,
  drawNearLineLabels,
  layoutBottomLegend,
} from "./render/legend";

function finiteValues(series: ReadonlyArray<Series>): number[] {
  const out: number[] = [];
  for (const s of series) {
    for (const v of s.values ?? []) if (v != null && Number.isFinite(v)) out.push(v);
    for (const p of s.points ?? []) if (Number.isFinite(p.y)) out.push(p.y);
  }
  return out;
}

function stackedMax(series: ReadonlyArray<Series>): number {
  const count = Math.max(0, ...series.map((s) => (s.values ?? []).length));
  let max = 0;
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (const s of series) {
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

/** 数量軸のスケール関数（値 → キャンバス座標）。 */
type Scale = (v: number) => number;

/**
 * 凡例モード。`ChartOptions["legend"]` の union をそのまま使い、`string` へ開かない
 * （開くと各所のリテラル比較が型検査から外れ、綴り違いが「そのモードだけ無言で
 * 描画されない」形で出る）。
 */
type LegendMode = NonNullable<NonNullable<ChartSpec["options"]>["legend"]>;

/** 系列描画の結果。`pointsBySeries` は near-line 凡例の配置に使う。 */
interface SeriesPlot {
  points: PlottedPoint[];
  /** combo は元の系列インデックスへ戻す都合で束ねないため空配列になる（従来挙動）。 */
  pointsBySeries: PlottedPoint[][];
}

/** 直交軸チャート（pie / 横棒を除く）の系列描画に必要な軸・積み上げの前提。 */
interface PlotContext {
  readonly plot: Rect;
  readonly theme: ChartTheme;
  readonly leftScale: Scale;
  readonly rightScale: Scale;
  readonly barScale: Scale;
  readonly scaleFor: (s: Series) => Scale;
  readonly hasRight: boolean;
  readonly stacked: boolean;
  readonly comboStacked: boolean;
  readonly lineBarCount: number;
}

/** pie は直交軸を使わないため専用分岐（軸マージンを使わず矩形中心に配置）。 */
function renderPieChart(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  args: { spec: ChartSpec; theme: ChartTheme; hasTitle: boolean },
): ChartLayout {
  const { spec, theme, hasTitle } = args;
  const TITLE_GAP = 28;
  const PAD = 8;
  const pieTop = rect.y + (hasTitle ? TITLE_GAP : PAD);
  const pieRect: Rect = {
    x: rect.x + PAD,
    y: pieTop,
    width: Math.max(1, rect.width - PAD * 2),
    height: Math.max(1, rect.height - (pieTop - rect.y) - PAD),
  };
  const piePoints = drawPie(ctx, pieRect, spec, theme, { donut: spec.options?.donut });
  if (spec.title) drawTitle(ctx, rect, spec.title, theme);
  return { spec, plotRect: pieRect, points: piePoints };
}

/** 横棒は数量軸＝x・分類軸＝y で軸が入れ替わるため専用分岐。 */
function renderHorizontalBarChart(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  args: { plot: Rect; spec: ChartSpec; theme: ChartTheme; legend: LegendMode },
): ChartLayout {
  const { plot, spec, theme, legend } = args;
  const hStacked = Boolean(spec.options?.stacked) && !spec.options?.grouped;
  const xMaxData = hStacked ? stackedMax(spec.series) : Math.max(0, ...finiteValues(spec.series));
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

/** 選択ハイライト帯（クリックされたカテゴリ列。系列の背後に淡色で敷く）。 */
function drawHighlightBand(
  ctx: CanvasRenderingContext2D,
  plot: Rect,
  args: { theme: ChartTheme; highlightIndex: number; lineBarCount: number },
): void {
  const bandW = plot.width / args.lineBarCount;
  ctx.save();
  ctx.fillStyle = args.theme.palette.label;
  ctx.globalAlpha = 0.16;
  ctx.fillRect(plot.x + bandW * args.highlightIndex, plot.y, bandW, plot.height);
  ctx.restore();
}

/** 参照値帯。 */
function drawReferenceBand(
  ctx: CanvasRenderingContext2D,
  plot: Rect,
  args: { theme: ChartTheme; band: { from: number; to: number }; leftScale: Scale },
): void {
  ctx.save();
  ctx.fillStyle = args.theme.palette.grid;
  ctx.globalAlpha = 0.4;
  const y0 = args.leftScale(args.band.to);
  const y1 = args.leftScale(args.band.from);
  ctx.fillRect(plot.x, Math.min(y0, y1), plot.width, Math.abs(y1 - y0));
  ctx.restore();
}

function plotBarSeries(ctx: CanvasRenderingContext2D, spec: ChartSpec, c: PlotContext): SeriesPlot {
  const bp = drawBars(ctx, c.plot, spec.series, c.theme, c.barScale, {
    stacked: spec.options?.stacked,
    grouped: spec.options?.grouped,
  });
  const pointsBySeries: PlottedPoint[][] = [];
  spec.series.forEach((_, si) => pointsBySeries.push(bp.filter((p) => p.seriesIndex === si)));
  return { points: [...bp], pointsBySeries };
}

function plotScatterPoints(ctx: CanvasRenderingContext2D, spec: ChartSpec, c: PlotContext): SeriesPlot {
  const [xMin, xMax] = scatterXBounds(spec);
  const xScale = linearScale([xMin, xMax], [c.plot.x, c.plot.x + c.plot.width]);
  const points: PlottedPoint[] = [];
  const pointsBySeries: PlottedPoint[][] = [];
  spec.series.forEach((series, si) => {
    const sp = drawScatterSeries(ctx, c.plot, series, si, c.theme, xScale, c.leftScale);
    points.push(...sp);
    pointsBySeries.push(sp);
  });
  return { points, pointsBySeries };
}

/** bar（背面）→ area → line（前面）の順に重ねる。色は元の系列インデックスで一貫させる。 */
function plotComboSeries(ctx: CanvasRenderingContext2D, spec: ChartSpec, c: PlotContext): SeriesPlot {
  const bandW = c.plot.width / c.lineBarCount;
  const categoryX = (i: number): number => c.plot.x + bandW * (i + 0.5);
  const barEntries: { s: Series; i: number }[] = [];
  const lineEntries: { s: Series; i: number }[] = [];
  const areaEntries: { s: Series; i: number }[] = [];
  spec.series.forEach((s, i) => {
    const colored: Series = s.color ? s : { ...s, color: c.theme.palette.series[i % c.theme.palette.series.length] };
    const t = s.type ?? "bar";
    if (t === "line") lineEntries.push({ s: colored, i });
    else if (t === "area") areaEntries.push({ s: colored, i });
    else barEntries.push({ s: colored, i });
  });
  // 棒群は1スケールを共有。代表軸は棒系列の axis で判定（全 right なら右軸）。
  const comboBarScale =
    c.hasRight && barEntries.length > 0 && barEntries.every((e) => e.s.axis === "right") ? c.rightScale : c.leftScale;
  const points: PlottedPoint[] = [];
  const bp = drawBars(ctx, c.plot, barEntries.map((e) => e.s), c.theme, comboBarScale, c.comboStacked ? { stacked: true } : { grouped: true });
  for (const p of bp) points.push({ ...p, seriesIndex: barEntries[p.seriesIndex]?.i ?? p.seriesIndex });
  if (areaEntries.length > 0) {
    // 面群は代表軸（先頭 area の axis）を共有し、combo stacked のとき積み上げる。
    const areaScale = c.scaleFor(areaEntries[0].s);
    const ap = drawAreaSeries(ctx, c.plot, areaEntries.map((e) => e.s), c.theme, areaScale, categoryX, { stacked: c.comboStacked });
    for (const p of ap) points.push({ ...p, seriesIndex: areaEntries[p.seriesIndex]?.i ?? p.seriesIndex });
  }
  for (const e of lineEntries) {
    const lp = drawLineSeries(ctx, c.plot, e.s, e.i, c.theme, c.scaleFor(e.s), categoryX);
    points.push(...lp);
  }
  return { points, pointsBySeries: [] };
}

function plotLineOrAreaSeries(ctx: CanvasRenderingContext2D, spec: ChartSpec, c: PlotContext): SeriesPlot {
  const bandW = c.plot.width / c.lineBarCount;
  const categoryX = (i: number): number => c.plot.x + bandW * (i + 0.5);
  const points: PlottedPoint[] = [];
  const pointsBySeries: PlottedPoint[][] = [];
  if (spec.kind === "area") {
    // area は左軸を使用（積み上げ整合のため）。右軸系列があっても左スケールで描く。
    const ap = drawAreaSeries(ctx, c.plot, spec.series, c.theme, c.leftScale, categoryX, { stacked: c.stacked });
    points.push(...ap);
    spec.series.forEach((_, si) => pointsBySeries.push(ap.filter((p) => p.seriesIndex === si)));
    return { points, pointsBySeries };
  }
  spec.series.forEach((series, si) => {
    const lp = drawLineSeries(ctx, c.plot, series, si, c.theme, c.scaleFor(series), categoryX);
    points.push(...lp);
    pointsBySeries.push(lp);
  });
  return { points, pointsBySeries };
}

function plotSeries(ctx: CanvasRenderingContext2D, spec: ChartSpec, c: PlotContext): SeriesPlot {
  if (spec.kind === "bar") return plotBarSeries(ctx, spec, c);
  if (spec.kind === "scatter") return plotScatterPoints(ctx, spec, c);
  if (spec.kind === "combo") return plotComboSeries(ctx, spec, c);
  return plotLineOrAreaSeries(ctx, spec, c);
}

/**
 * 凡例の実効モードを決める。bottom は下部行、それ以外で combo は隣接
 * （near-line は line 端のみで bar を表せない）。
 *
 * near-line（系列名を線端近傍に置く）は折れ線専用。棒・面では系列色のラベルが
 * バー/面の塗りに重なり同系色で不可視になるため、複数系列は隣接凡例へ振り替え、
 * 単一系列は凡例不要として抑止する（デジタル庁ガイドブック p.46「グラフと凡例を隣接させる」）。
 */
function resolveLegendMode(legend: LegendMode, spec: ChartSpec): LegendMode {
  let mode: LegendMode = legend;
  if (legend !== "none" && legend !== "bottom" && spec.kind === "combo") mode = "adjacent";
  if (mode === "near-line" && (spec.kind === "bar" || spec.kind === "area")) {
    return spec.series.length > 1 ? "adjacent" : "none";
  }
  return mode;
}

function drawChartLegend(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  args: {
    plot: Rect;
    spec: ChartSpec;
    theme: ChartTheme;
    legendMode: LegendMode;
    pointsBySeries: PlottedPoint[][];
    hasRight: boolean;
    stacked: boolean;
    wantBottomLegend: boolean;
    bottomLegendRows: ReturnType<typeof layoutBottomLegend>;
  },
): void {
  const { plot, spec, theme, legendMode, pointsBySeries, hasRight, stacked, wantBottomLegend, bottomLegendRows } = args;
  if (legendMode === "near-line") {
    drawNearLineLabels(ctx, spec.series, pointsBySeries, theme);
    return;
  }
  if (legendMode === "adjacent") {
    // 右軸ありは凡例を右軸ラベルぶん右へずらす（重なり回避）。
    // 積み上げ（棒/面）は凡例順をスタックの視覚順（上の積み＝上の凡例）に合わせて反転する。
    drawAdjacentLegend(ctx, rect, plot, spec.series, theme, hasRight ? 44 : 0, stacked);
    return;
  }
  if (legendMode === "bottom" && wantBottomLegend && bottomLegendRows.length > 0) {
    const bandTop = rect.y + rect.height - (bottomLegendRows.length * BOTTOM_LEGEND_ROW_H + BOTTOM_LEGEND_PAD);
    drawBottomLegend(ctx, rect, bottomLegendRows, spec.series, bandTop, theme);
  }
}

/** 図種によらず先に決まる外枠（凡例モード・右軸の有無・plot 矩形）。 */
interface ChartFrame {
  legend: LegendMode;
  hasTitle: boolean;
  hasRight: boolean;
  yAxisLabel: string | undefined;
  yAxisRightLabel: string | undefined;
  wantBottomLegend: boolean;
  bottomLegendRows: ReturnType<typeof layoutBottomLegend>;
  plot: Rect;
}

function computeChartFrame(ctx: CanvasRenderingContext2D, rect: Rect, spec: ChartSpec): ChartFrame {
  const legend = spec.options?.legend ?? "near-line";
  const hasTitle = Boolean(spec.title);
  // 第2Y軸: combo / line のみ対応（棒の積み上げ・面の積み上げと右軸の併用は破綻するため除外）。
  const supportsDualAxis = spec.kind === "combo" || spec.kind === "line";
  const hasRight = supportsDualAxis && spec.series.some((s) => s.axis === "right");
  const yAxisLabel = spec.options?.yAxis?.label;
  const yAxisRightLabel = spec.options?.yAxisRight?.label;
  // bottom 凡例は下部に行を確保するため、plot 計算前に行レイアウトを求める。
  const wantBottomLegend = legend === "bottom" && spec.kind !== "pie" && !(spec.kind === "bar" && spec.options?.horizontal);
  const bottomLegendRows = wantBottomLegend
    ? layoutBottomLegend(ctx, spec.series, Math.max(40, rect.width - 64))
    : [];
  const plot = computePlotRect(rect, {
    hasTitle,
    legend,
    hasRightAxis: hasRight,
    hasYAxisLabel: Boolean(yAxisLabel) && spec.kind !== "pie",
    hasRightAxisLabel: Boolean(yAxisRightLabel) && hasRight,
    legendBottomRows: bottomLegendRows.length,
  });
  return { legend, hasTitle, hasRight, yAxisLabel, yAxisRightLabel, wantBottomLegend, bottomLegendRows, plot };
}

function drawBackground(ctx: CanvasRenderingContext2D, rect: Rect, theme: ChartTheme): void {
  ctx.save();
  ctx.fillStyle = theme.palette.background;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

/** combo stacked では棒系列・面系列をそれぞれ積み上げ和、折れ線は素の最大で評価する。 */
function makeAxisMax(flags: { stacked: boolean; comboStacked: boolean }): (list: ReadonlyArray<Series>) => number {
  return (list) => {
    if (flags.comboStacked) {
      const bars = list.filter((s) => (s.type ?? "bar") === "bar");
      const areas = list.filter((s) => s.type === "area");
      const lines = list.filter((s) => s.type === "line");
      return Math.max(stackedMax(bars), stackedMax(areas), 0, ...finiteValues(lines));
    }
    return flags.stacked ? stackedMax(list) : Math.max(0, ...finiteValues(list));
  };
}

interface AxisSetup {
  context: PlotContext;
  leftTicks: number[];
  rightTicks: number[];
  xLabels: string[];
}

function buildAxisSetup(
  spec: ChartSpec,
  args: { plot: Rect; theme: ChartTheme; hasRight: boolean },
): AxisSetup {
  const { plot, theme, hasRight } = args;
  const stacked = Boolean(spec.options?.stacked) && (spec.kind === "bar" || spec.kind === "area");
  // combo の stacked は棒系列のみ積み上げる（line/area 系列は積まない）。
  const comboStacked = spec.kind === "combo" && spec.options?.stacked === true;

  // 左右軸スケール: 左＝right 以外の系列、右＝right 系列。右が無ければ左単一軸。
  const leftSeries = hasRight ? spec.series.filter((s) => s.axis !== "right") : spec.series;
  const rightSeries = hasRight ? spec.series.filter((s) => s.axis === "right") : [];
  const axisMax = makeAxisMax({ stacked, comboStacked });
  const leftTicks = niceTicks(0, axisMax(leftSeries), 5);
  const leftScale = linearScale([0, leftTicks.at(-1) ?? 1], [plot.y + plot.height, plot.y]);
  const rightTicks = niceTicks(0, axisMax(rightSeries), 5);
  const rightScale = linearScale([0, rightTicks.at(-1) ?? 1], [plot.y + plot.height, plot.y]);
  /** 系列の数量軸スケール（right 系列は右軸、それ以外は左軸）。 */
  const scaleFor = (s: Series): Scale => (hasRight && s.axis === "right" ? rightScale : leftScale);
  // 棒群は1軸を共有する（全系列が right のときのみ右軸、それ以外は左軸）。
  const barScale = hasRight && spec.series.every((s) => s.axis === "right") ? rightScale : leftScale;

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

  return {
    context: {
      plot,
      theme,
      leftScale,
      rightScale,
      barScale,
      scaleFor,
      hasRight,
      stacked,
      comboStacked,
      lineBarCount,
    },
    leftTicks,
    rightTicks,
    xLabels,
  };
}

/** 軸・ハイライト帯・参照値帯・イベント印（いずれも系列より背面）。 */
function drawPlotDecorations(
  ctx: CanvasRenderingContext2D,
  spec: ChartSpec,
  args: {
    setup: AxisSetup;
    theme: ChartTheme;
    yAxisLabel: string | undefined;
    yAxisRightLabel: string | undefined;
    highlightIndex: number | null | undefined;
  },
): void {
  const { context: c, leftTicks, rightTicks, xLabels } = args.setup;
  drawAxes(ctx, c.plot, leftTicks, c.leftScale, xLabels, args.theme, args.yAxisLabel);
  if (c.hasRight) drawRightAxis(ctx, c.plot, rightTicks, c.rightScale, args.theme, args.yAxisRightLabel);

  const highlightIndex = args.highlightIndex;
  if (highlightIndex != null && highlightIndex >= 0 && highlightIndex < c.lineBarCount) {
    drawHighlightBand(ctx, c.plot, { theme: args.theme, highlightIndex, lineBarCount: c.lineBarCount });
  }

  const band = spec.options?.referenceBand;
  if (band) drawReferenceBand(ctx, c.plot, { theme: args.theme, band, leftScale: c.leftScale });

  // イベント印（系列の背後に縦線/ドットで重ねる）
  if (spec.markers && spec.markers.length > 0) {
    drawMarkers(ctx, c.plot, xLabels, spec.markers, args.theme);
  }
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
  /** 選択中カテゴリ（クリック選択のハイライト帯）。null は非選択。 */
  highlightIndex?: number | null,
): ChartLayout {
  const frame = computeChartFrame(ctx, rect, spec);
  drawBackground(ctx, rect, theme);

  if (spec.kind === "pie") {
    return renderPieChart(ctx, rect, { spec, theme, hasTitle: frame.hasTitle });
  }
  if (spec.kind === "bar" && spec.options?.horizontal) {
    return renderHorizontalBarChart(ctx, rect, { plot: frame.plot, spec, theme, legend: frame.legend });
  }

  const setup = buildAxisSetup(spec, { plot: frame.plot, theme, hasRight: frame.hasRight });
  drawPlotDecorations(ctx, spec, {
    setup,
    theme,
    yAxisLabel: frame.yAxisLabel,
    yAxisRightLabel: frame.yAxisRightLabel,
    highlightIndex,
  });

  const { points, pointsBySeries } = plotSeries(ctx, spec, setup.context);

  drawChartLegend(ctx, rect, {
    plot: frame.plot,
    spec,
    theme,
    legendMode: resolveLegendMode(frame.legend, spec),
    pointsBySeries,
    hasRight: frame.hasRight,
    stacked: setup.context.stacked,
    wantBottomLegend: frame.wantBottomLegend,
    bottomLegendRows: frame.bottomLegendRows,
  });

  if (spec.title) drawTitle(ctx, rect, spec.title, theme);

  return { spec, plotRect: frame.plot, points };
}
