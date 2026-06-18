import type { Rect } from "../types";

/** 軸・タイトル・凡例の固定マージン（px）。 */
const AXIS_LEFT = 56;
const AXIS_BOTTOM = 28;
const TITLE_H = 28;
const TOP_PAD = 8;
const RIGHT_PAD = 8;
const LEGEND_RIGHT = 72;

/**
 * 描画領域 rect から、軸・タイトル・凡例ぶんを差し引いた plot 矩形を返す（純粋関数）。
 * near-line / adjacent はどちらも右側に系列ラベル空間を確保する。
 */
export function computePlotRect(
  rect: Rect,
  o: { hasTitle: boolean; legend: "near-line" | "adjacent" | "none" },
): Rect {
  const top = rect.y + (o.hasTitle ? TITLE_H : TOP_PAD);
  const rightInset = o.legend === "none" ? RIGHT_PAD : LEGEND_RIGHT;
  const left = rect.x + AXIS_LEFT;
  const right = rect.x + rect.width - rightInset;
  const bottom = rect.y + rect.height - AXIS_BOTTOM;
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}
