"use client";

import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import { Box, IconButton, Tooltip } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Editor } from "@tiptap/react";
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
    <Box
      sx={{
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
            sx={{ width: BTN_SIZE, height: BTN_SIZE, p: 0 }}
          >
            <KeyboardArrowUpIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </span>
      </Tooltip>

      <Box
        ref={barRef}
        onClick={handleClick}
        sx={{
          flex: 1,
          width: "100%",
          position: "relative",
          cursor: "pointer",
          bgcolor: barBg,
          borderLeft: `1px solid ${theme.palette.divider}`,
          overflow: "hidden",
        }}
      >
        {markerRatios.map((ratio) => (
          <Box
            key={`marker-${ratio}`}
            sx={{
              position: "absolute",
              left: 0,
              right: 0,
              top: `${ratio * 100}%`,
              height: markerMinHeight,
              bgcolor: markerColor,
              borderRadius: "1px",
              pointerEvents: "none",
            }}
          />
        ))}
      </Box>

      <Tooltip title="次の変更へ" placement="left">
        <span>
          <IconButton
            size="small"
            disabled={!hasChanges}
            onClick={goToNext}
            aria-label="次の変更へ"
            sx={{ width: BTN_SIZE, height: BTN_SIZE, p: 0 }}
          >
            <KeyboardArrowDownIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}
