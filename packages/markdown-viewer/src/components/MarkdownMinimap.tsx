"use client";

import { useTheme } from "@mui/material/styles";
import { KeyboardArrowDownIcon, KeyboardArrowUpIcon } from "../ui/icons";
import { IconButton } from "../ui/IconButton";
import { Tooltip } from "../ui/Tooltip";
import type { Editor } from "@anytime-markdown/markdown-react";
import { useCallback, useRef } from "react";

import { useMarkdownMinimap } from "../hooks/useMarkdownMinimap";

const BAR_WIDTH = 16;
const BTN_SIZE = 20;

interface MarkdownMinimapProps {
  editor: Editor | null;
  editorHeight: number;
}

export function MarkdownMinimap({
  editor,
  editorHeight,
}: Readonly<MarkdownMinimapProps>) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const barRef = useRef<HTMLDivElement | null>(null);

  const { markerRatios, hasChanges, handleBarClick, goToNext, goToPrev } =
    useMarkdownMinimap(editor);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = barRef.current?.getBoundingClientRect();
      if (!rect) return;
      const ratio = (e.clientY - rect.top) / rect.height;
      handleBarClick(ratio);
    },
    [handleBarClick],
  );

  const barBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const markerColor = isDark ? "rgba(63,185,80,0.7)" : "rgba(46,160,67,0.7)";

  const barHeight = editorHeight - BTN_SIZE * 2;
  const markerMinHeight = Math.max(3, barHeight * 0.03);

  return (
    <div
      style={{
        width: BAR_WIDTH,
        height: editorHeight,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        zIndex: 5,
        userSelect: "none",
      }}
    >
      <Tooltip title="前の変更へ" placement="left">
        <span>
          <IconButton
            size="small"
            disabled={!hasChanges}
            onClick={goToPrev}
            aria-label="前の変更へ"
            style={{ width: BTN_SIZE, height: BTN_SIZE, padding: 0 }}
          >
            <KeyboardArrowUpIcon fontSize={14} />
          </IconButton>
        </span>
      </Tooltip>

      <div
        ref={barRef}
        onClick={handleClick}
        style={{
          flex: 1,
          width: "100%",
          position: "relative",
          cursor: "pointer",
          backgroundColor: barBg,
          borderLeft: `1px solid ${theme.palette.divider}`,
          overflow: "hidden",
        }}
      >
        {markerRatios.map((ratio) => (
          <div
            key={`marker-${ratio}`}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: `${ratio * 100}%`,
              height: markerMinHeight,
              backgroundColor: markerColor,
              borderRadius: "1px",
              pointerEvents: "none",
            }}
          />
        ))}
      </div>

      <Tooltip title="次の変更へ" placement="left">
        <span>
          <IconButton
            size="small"
            disabled={!hasChanges}
            onClick={goToNext}
            aria-label="次の変更へ"
            style={{ width: BTN_SIZE, height: BTN_SIZE, padding: 0 }}
          >
            <KeyboardArrowDownIcon fontSize={14} />
          </IconButton>
        </span>
      </Tooltip>
    </div>
  );
}
