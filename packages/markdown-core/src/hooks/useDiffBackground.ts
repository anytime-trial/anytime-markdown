import { alpha, useTheme } from "@mui/material/styles";
import { useCallback, useMemo } from "react";

import { getErrorMain, getSuccessMain } from "../constants/colors";
import { useEditorSettingsContext } from "../useEditorSettings";
import { buildColorRuns } from "../utils/colorRuns";
import type { DiffResult } from "../utils/diffEngine";

export function useDiffBackground(
  diffResult: DiffResult | null,
  sourceMode: boolean,
): { leftBgGradient: string; rightBgGradient: string } {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const settings = useEditorSettingsContext();

  // Build a CSS gradient from diff lines for source-mode textarea coloring
  const buildBgGradient = useCallback(
    (lines: { type: string }[] | undefined) => {
      if (!sourceMode || !lines) return "none";
      const lineColors: (string | null)[] = [];
      for (const line of lines) {
        // padding行もスキップせず含める（テキストエリアに空行として表示されるため）
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
      // editorSettings から実際の行高さを計算（px単位）
      const lineH = settings.fontSize * settings.lineHeight;
      const padTop = 16; // pt: 2 = 16px (MUI spacing 8px * 2)
      const stops: string[] = [`transparent 0px`, `transparent ${padTop}px`];
      let y = padTop;
      for (const run of runs) {
        stops.push(`${run.color} ${y}px`, `${run.color} ${y + run.count * lineH}px`);
        y += run.count * lineH;
      }
      return `linear-gradient(to bottom, ${stops.join(", ")})`;
    },
    [sourceMode, isDark, settings.fontSize, settings.lineHeight],
  );

  const leftBgGradient = useMemo(
    () => buildBgGradient(diffResult?.leftLines),
    [buildBgGradient, diffResult],
  );
  const rightBgGradient = useMemo(
    () => buildBgGradient(diffResult?.rightLines),
    [buildBgGradient, diffResult],
  );

  return { leftBgGradient, rightBgGradient };
}
