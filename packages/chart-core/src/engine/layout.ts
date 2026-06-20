import type { Rect } from "../types";
import { BOTTOM_LEGEND_PAD, BOTTOM_LEGEND_ROW_H } from "./render/legend";

/** 軸・タイトル・凡例の固定マージン（px）。 */
const AXIS_LEFT = 56;
const AXIS_BOTTOM = 28;
const TITLE_H = 28;
const TOP_PAD = 8;
const RIGHT_PAD = 8;
const LEGEND_RIGHT = 72;
const RIGHT_AXIS = 48;
/** Y 軸ラベル（縦書き）ぶんの追加余白。 */
const AXIS_LABEL_PAD = 18;

/**
 * 描画領域 rect から、軸・タイトル・凡例ぶんを差し引いた plot 矩形を返す（純粋関数）。
 * near-line / adjacent は右側に系列ラベル空間、bottom は下部に凡例行ぶんを確保する。
 * hasRightAxis 時は右軸ラベル用に右余白を確保する（凡例余白と大きい方を採用）。
 */
export function computePlotRect(
  rect: Rect,
  o: {
    hasTitle: boolean;
    legend: "near-line" | "adjacent" | "none" | "bottom";
    hasRightAxis?: boolean;
    hasYAxisLabel?: boolean;
    hasRightAxisLabel?: boolean;
    /** bottom 凡例の行数（下部予約高さの算出に使う）。 */
    legendBottomRows?: number;
  },
): Rect {
  const top = rect.y + (o.hasTitle ? TITLE_H : TOP_PAD);
  const isBottom = o.legend === "bottom";
  // bottom 凡例は右に列を作らない（右余白は軸ラベル/最小パッドのみ）。
  const legendInset = o.legend === "none" || isBottom ? RIGHT_PAD : LEGEND_RIGHT;
  const rightInset =
    (o.hasRightAxis ? (legendInset === RIGHT_PAD ? RIGHT_AXIS : legendInset + RIGHT_AXIS) : legendInset) +
    (o.hasRightAxisLabel ? AXIS_LABEL_PAD : 0);
  const left = rect.x + AXIS_LEFT + (o.hasYAxisLabel ? AXIS_LABEL_PAD : 0);
  const right = rect.x + rect.width - rightInset;
  // 実際に bottom 凡例を描く行がある場合のみ下部予約（横棒/pie 等で 0 行ならデッドスペースを作らない）。
  const legendRows = isBottom ? o.legendBottomRows ?? 0 : 0;
  const bottomLegend = legendRows > 0 ? legendRows * BOTTOM_LEGEND_ROW_H + BOTTOM_LEGEND_PAD : 0;
  const bottom = rect.y + rect.height - AXIS_BOTTOM - bottomLegend;
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}
