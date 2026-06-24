import { alpha, getErrorMain, getSuccessMain } from "../constants/colors";

interface ColorRun {
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
 * diff 行種別 1 件に対応する背景色を返す。
 * 追加/変更後=緑、削除/変更前=赤、それ以外（equal / padding 等）=透明。
 * 折り返し対応の行単位背景レイヤー（SourceSegment のミラー）で各行 div に適用する。
 */
export function diffLineBgColor(type: string, isDark: boolean): string {
  switch (type) {
    case "added":
    case "modified-new":
      return alpha(getSuccessMain(isDark), 0.18);
    case "removed":
    case "modified-old":
      return alpha(getErrorMain(isDark), 0.18);
    default:
      return "transparent";
  }
}
