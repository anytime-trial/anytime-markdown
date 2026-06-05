import { alpha } from "@mui/material/styles";

import { getErrorMain, getSuccessMain } from "../constants/colors";

export interface ColorRun {
  color: string;
  count: number;
}

/** 連続する同色をランとして集約する */
export function buildColorRuns(colors: (string | null)[]): ColorRun[] {
  const runs: ColorRun[] = [];
  for (const c of colors) {
    const color = c ?? "transparent";
    const last = runs.at(-1);
    if (last?.color === color) {
      last.count++;
    } else {
      runs.push({ color, count: 1 });
    }
  }
  return runs;
}

/**
 * diff 行種別の配列から、ソースモード textarea 用の縦方向背景グラデーションを組み立てる。
 * useDiffBackground（パネル全体）と SourceSegment（折りたたみ時のスライス単位）で共有する純粋関数。
 * 追加/変更後=緑、削除/変更前=赤、それ以外=透明。padding 行も空行として含める。
 */
export function buildDiffGradient(
  lines: ReadonlyArray<{ type: string }>,
  isDark: boolean,
  fontSize: number,
  lineHeight: number,
): string {
  const lineColors: (string | null)[] = [];
  for (const line of lines) {
    switch (line.type) {
      case "added":
      case "modified-new":
        lineColors.push(alpha(getSuccessMain(isDark), 0.18));
        break;
      case "removed":
      case "modified-old":
        lineColors.push(alpha(getErrorMain(isDark), 0.18));
        break;
      default:
        lineColors.push(null);
    }
  }
  if (lineColors.length === 0) return "none";
  const runs = buildColorRuns(lineColors);
  const lineH = fontSize * lineHeight;
  const padTop = 16; // pt: 2 = 16px
  const stops: string[] = [`transparent 0px`, `transparent ${padTop}px`];
  let y = padTop;
  for (const run of runs) {
    stops.push(`${run.color} ${y}px`, `${run.color} ${y + run.count * lineH}px`);
    y += run.count * lineH;
  }
  return `linear-gradient(to bottom, ${stops.join(", ")})`;
}
