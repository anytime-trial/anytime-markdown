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

const BOTTOM_MARKER = 10;
const BOTTOM_GAP = 6; // マーカーと文字の間
const BOTTOM_ITEM_GAP = 16; // 項目間
export const BOTTOM_LEGEND_ROW_H = 18;
/** bottom 凡例帯の上下パッド（plot 予約と bandTop で共有）。 */
export const BOTTOM_LEGEND_PAD = 6;

interface LegendItem {
  readonly index: number;
  readonly name: string;
  readonly width: number;
}

/**
 * bottom 凡例の行レイアウトを算出する（純粋計算）。availWidth に収まるよう折り返す。
 * 返り値の行数で下部の予約高さ（行数 × BOTTOM_LEGEND_ROW_H）を決められる。
 */
export function layoutBottomLegend(
  ctx: CanvasRenderingContext2D,
  seriesList: ReadonlyArray<Series>,
  availWidth: number,
): LegendItem[][] {
  ctx.save();
  ctx.font = "11px sans-serif";
  const items: LegendItem[] = seriesList.map((s, index) => ({
    index,
    name: s.name,
    width: BOTTOM_MARKER + BOTTOM_GAP + ctx.measureText(s.name).width,
  }));
  ctx.restore();

  const rows: LegendItem[][] = [];
  let cur: LegendItem[] = [];
  let curW = 0;
  for (const it of items) {
    const add = (cur.length === 0 ? 0 : BOTTOM_ITEM_GAP) + it.width;
    if (cur.length > 0 && curW + add > availWidth) {
      rows.push(cur);
      cur = [];
      curW = 0;
    }
    cur.push(it);
    curW += cur.length === 1 ? it.width : add;
  }
  if (cur.length > 0) rows.push(cur);
  return rows;
}

/**
 * bottom 凡例: グラフ下部にマーカー + 系列名を水平中央寄せで（必要なら複数行）並べる。
 */
export function drawBottomLegend(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  rows: ReadonlyArray<ReadonlyArray<LegendItem>>,
  seriesList: ReadonlyArray<Series>,
  bandTop: number,
  theme: ChartTheme,
): void {
  ctx.save();
  ctx.font = "11px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const centerX = rect.x + rect.width / 2;
  rows.forEach((row, ri) => {
    const totalW = row.reduce((acc, it) => acc + it.width, 0) + BOTTOM_ITEM_GAP * (row.length - 1);
    let x = centerX - totalW / 2;
    const y = bandTop + BOTTOM_LEGEND_ROW_H * ri + BOTTOM_LEGEND_ROW_H / 2;
    for (const it of row) {
      ctx.fillStyle = seriesColor(it.index, seriesList[it.index], theme);
      ctx.fillRect(x, y - 4, BOTTOM_MARKER, 8);
      ctx.fillStyle = theme.palette.text;
      ctx.fillText(it.name, x + BOTTOM_MARKER + BOTTOM_GAP, y);
      x += it.width + BOTTOM_ITEM_GAP;
    }
  });
  ctx.restore();
}

/**
 * adjacent 凡例: 右側にマーカー + 系列名を縦に並べる（グラフと隣接・順序対応）。
 * reverseOrder=true で並びを反転する（積み上げの最上段＝凡例最上段に合わせるため）。
 */
export function drawAdjacentLegend(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  plot: Rect,
  seriesList: ReadonlyArray<Series>,
  theme: ChartTheme,
  rightOffset = 0,
  reverseOrder = false,
): void {
  ctx.save();
  ctx.font = "11px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  // rightOffset: 右軸ラベルぶん凡例を右へずらし重なりを避ける。
  const x = plot.x + plot.width + 12 + rightOffset;
  const lineH = 18;
  const startY = plot.y + 4;
  // 色は元の系列インデックス、配置行はスタック視覚順（必要なら反転）に対応させる。
  const order = seriesList.map((_, si) => si);
  if (reverseOrder) order.reverse();
  order.forEach((si, row) => {
    const series = seriesList[si];
    const y = startY + lineH * row;
    if (y > rect.y + rect.height) return;
    ctx.fillStyle = seriesColor(si, series, theme);
    ctx.fillRect(x, y - 4, 10, 8);
    ctx.fillStyle = theme.palette.text;
    ctx.fillText(series.name, x + 16, y);
  });
  ctx.restore();
}
