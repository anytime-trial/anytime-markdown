/**
 * デジタル庁ダッシュボードガイドブック（4.3 カラーパレット）準拠のチャートテーマ。
 * チャートコンテンツ色はガイドブックの 7 系統パレット（各 50–1200）に基づく。
 * ダークモードはガイドブック未提示のため、提示のコントラスト規則を満たす等価値を導出する。
 */

import type { ChartTheme, PaletteKey } from "./types";

/** 各系統 6 段（濃→淡）。ガイドブック 35p の 50/200/400/600/900/1200 を濃い順に並べる。 */
const PALETTES: Record<PaletteKey, readonly string[]> = {
  blue: ["#000060", "#0017C1", "#3460FB", "#7096F8", "#C5D7FB", "#D9E6FF"],
  lightBlue: ["#00234B", "#0055AD", "#008BF2", "#57B8FF", "#C0E4FF", "#F0F9FF"],
  cyan: ["#003741", "#006F83", "#00A3BF", "#2BC8E4", "#99F2FF", "#E9F7F9"],
  green: ["#032213", "#115A36", "#259D63", "#51B883", "#9BD4B5", "#E6F5EC"],
  orange: ["#541E00", "#AC3E00", "#FB5B01", "#FF8D44", "#FFC199", "#FFEEE2"],
  red: ["#620000", "#CE0000", "#FE3939", "#FF7171", "#FFBBBB", "#FDEEEE"],
  solidGray: ["#1A1A1A", "#4D4D4D", "#767676", "#999999", "#CCCCCC", "#F2F2F2"],
};

/** 非強調系列の減色（Neutral SolidGray 400）。 */
const MUTED = "#999999";

const LIGHT = {
  axis: "#626264",
  grid: "#CCCCCC",
  label: "#626264",
  text: "#000000",
  background: "#FFFFFF",
} as const;

const DARK = {
  axis: "#A0A0A8",
  grid: "#3A3A40",
  label: "#A0A0A8",
  text: "#FFFFFF",
  background: "#1E1E22",
} as const;

/**
 * チャートテーマを返す。
 * dark では背景（暗）とのコントラストを保つため、彩度の高い中間〜淡色側を優先する。
 */
export function getChartTheme(mode: "light" | "dark", key: PaletteKey = "blue"): ChartTheme {
  const base = PALETTES[key];
  const series = mode === "dark" ? [...base].reverse() : [...base];
  const c = mode === "dark" ? DARK : LIGHT;
  return {
    mode,
    palette: {
      series,
      muted: MUTED,
      axis: c.axis,
      grid: c.grid,
      label: c.label,
      text: c.text,
      background: c.background,
    },
  };
}

function relativeLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = Number.parseInt(m[1], 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG コントラスト比（1〜21）。 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

export { PALETTES };
