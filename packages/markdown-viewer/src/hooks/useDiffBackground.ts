import { useCallback, useMemo } from "react";

import { useIsDark } from "../contexts/ThemeModeContext";
import { useEditorSettingsContext } from "../useEditorSettings";
import { buildDiffGradient } from "../utils/colorRuns";
import type { DiffResult } from "../utils/diffEngine";

export function useDiffBackground(
  diffResult: DiffResult | null,
  sourceMode: boolean,
): { leftBgGradient: string; rightBgGradient: string } {
  const isDark = useIsDark();
  const settings = useEditorSettingsContext();

  // Build a CSS gradient from diff lines for source-mode textarea coloring
  const buildBgGradient = useCallback(
    (lines: { type: string }[] | undefined) => {
      if (!sourceMode || !lines) return "none";
      return buildDiffGradient(lines, isDark, settings.fontSize, settings.lineHeight);
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
