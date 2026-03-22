import {
  Box,
  Divider,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import React, { useEffect, useRef, useState } from "react";

import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG, getDivider, getErrorMain, getSuccessMain, getTextPrimary } from "../constants/colors";
import { useEditorSettingsContext } from "../useEditorSettings";
import { computeInlineDiff, type DiffResult, type InlineSegment } from "../utils/diffEngine";

/** ホバー行プレビュー（独自 state で再レンダリングを局所化） */
export const LinePreviewPanel = React.memo(function LinePreviewPanel({
  diffResult,
  sourceMode,
  hoverSetterRef,
}: Readonly<{
  diffResult: DiffResult | null;
  sourceMode: boolean;
  hoverSetterRef: React.RefObject<((v: number | null) => void) | null>;
}>) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const settings = useEditorSettingsContext();
  const [hoveredLineIdx, setHoveredLineIdx] = useState<number | null>(null);
  const previewTopRef = useRef<HTMLDivElement>(null);
  const previewBottomRef = useRef<HTMLDivElement>(null);
  const isSyncingPreview = useRef(false);

  useEffect(() => {
    hoverSetterRef.current = setHoveredLineIdx;
    return () => { hoverSetterRef.current = null; };
  }, [hoverSetterRef]);

  if (!sourceMode || !diffResult) return null;

  const leftLine = hoveredLineIdx === null ? null : diffResult.leftLines?.[hoveredLineIdx];
  const rightLine = hoveredLineIdx === null ? null : diffResult.rightLines?.[hoveredLineIdx];
  const leftText = leftLine?.text ?? "";
  const rightText_ = rightLine?.text ?? "";
  const hasBoth = hoveredLineIdx !== null && leftText !== "" && rightText_ !== "" && leftText !== rightText_;
  const inlineDiff = hasBoth ? computeInlineDiff(leftText, rightText_) : null;

  const previewStyle: React.CSSProperties = {
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 2,
    paddingBottom: 2,
    fontFamily: "monospace",
    fontSize: `${settings.fontSize + 4}px`,
    lineHeight: 1.4,
    whiteSpace: "pre",
    overflowX: "auto",
    overflowY: "hidden",
    color: getTextPrimary(isDark),
  };

  const renderSegments = (segments: InlineSegment[], highlightType: "removed" | "added") =>
    segments.map((seg, i) => (
      <span
        key={`seg-${seg.type}-${i}-${seg.text.slice(0, 16)}`}
        style={
          seg.type === highlightType
            ? {
                backgroundColor: alpha(
                  highlightType === "removed"
                    ? getErrorMain(isDark)
                    : getSuccessMain(isDark),
                  0.35,
                ),
                textDecoration: highlightType === "removed" ? "line-through" : "underline",
                borderRadius: 2,
              }
            : undefined
        }
      >
        {seg.text}
      </span>
    ));

  const handlePreviewScroll = (source: React.UIEvent<HTMLDivElement>, targetRef: React.RefObject<HTMLDivElement | null>) => {
    if (isSyncingPreview.current) return;
    isSyncingPreview.current = true;
    const target = targetRef.current;
    if (target) target.scrollLeft = source.currentTarget.scrollLeft;
    requestAnimationFrame(() => { isSyncingPreview.current = false; });
  };

  const fallbackOld = (hoveredLineIdx !== null && leftText) ? leftText : "\u00A0";
  const topContent = inlineDiff ? renderSegments(inlineDiff.oldSegments, "removed") : fallbackOld;
  const fallbackNew = (hoveredLineIdx !== null && rightText_) ? rightText_ : "\u00A0";
  const bottomContent = inlineDiff ? renderSegments(inlineDiff.newSegments, "added") : fallbackNew;

  return (
    <Box sx={{ borderTop: 1, borderColor: getDivider(isDark), bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG, flexShrink: 0 }}>
      <div
        ref={previewTopRef}
        style={previewStyle}
        onScroll={(e) => handlePreviewScroll(e, previewBottomRef)}
      >
        {topContent}
      </div>
      <Divider />
      <div
        ref={previewBottomRef}
        style={previewStyle}
        onScroll={(e) => handlePreviewScroll(e, previewTopRef)}
      >
        {bottomContent}
      </div>
    </Box>
  );
});
