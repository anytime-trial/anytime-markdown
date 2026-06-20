import type { Rect } from "../types";

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
 * near-line / adjacent はどちらも右側に系列ラベル空間を確保する。
 * hasRightAxis 時は右軸ラベル用に右余白を確保する（凡例余白と大きい方を採用）。
 */
export function computePlotRect(
  rect: Rect,
  o: {
    hasTitle: boolean;
    legend: "near-line" | "adjacent" | "none";
    hasRightAxis?: boolean;
    hasYAxisLabel?: boolean;
    hasRightAxisLabel?: boolean;
  },
): Rect {
  const top = rect.y + (o.hasTitle ? TITLE_H : TOP_PAD);
  const legendInset = o.legend === "none" ? RIGHT_PAD : LEGEND_RIGHT;
  // 右軸ありは軸ラベルぶんを加算（凡例と右軸ラベルが重ならないよう両方分を確保）。
  const rightInset =
    (o.hasRightAxis ? (o.legend === "none" ? RIGHT_AXIS : legendInset + RIGHT_AXIS) : legendInset) +
    (o.hasRightAxisLabel ? AXIS_LABEL_PAD : 0);
  const left = rect.x + AXIS_LEFT + (o.hasYAxisLabel ? AXIS_LABEL_PAD : 0);
  const right = rect.x + rect.width - rightInset;
  const bottom = rect.y + rect.height - AXIS_BOTTOM;
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}
