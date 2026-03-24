import { Box, useTheme } from "@mui/material";
import React from "react";

import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG } from "../constants/colors";
import { REDUCED_MOTION_SX, TRANSITION_FAST } from "../constants/uiPatterns";
import type { UseZoomPanReturn } from "../hooks/useZoomPan";

interface ZoomablePreviewProps {
  fsZP: UseZoomPanReturn;
  children: React.ReactNode;
  /** Transform origin: "center center" (default) or "top left" */
  origin?: "center" | "top-left";
}

/** ズーム・パン対応のプレビューコンテナ */
export function ZoomablePreview({ fsZP, children, origin = "center" }: Readonly<ZoomablePreviewProps>) {
  const isDark = useTheme().palette.mode === "dark";
  const transformOrigin = origin === "top-left" ? "top left" : "center center";
  const justify = origin === "top-left" ? "flex-start" : "center";
  const align = origin === "top-left" ? "flex-start" : "center";

  return (
    <Box
      sx={{
        flex: 1,
        overflow: "hidden",
        bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG,
        cursor: "grab",
        "&:active": { cursor: "grabbing" },
      }}
      onPointerDown={fsZP.handlePointerDown}
      onPointerMove={fsZP.handlePointerMove}
      onPointerUp={fsZP.handlePointerUp}
      onWheel={fsZP.handleWheel}
    >
      <Box sx={{
        width: "100%", height: "100%",
        display: "flex", justifyContent: justify, alignItems: align,
        transform: `translate(${fsZP.pan.x}px, ${fsZP.pan.y}px) scale(${fsZP.zoom})`,
        transformOrigin,
        transition: fsZP.isPanningRef.current ? "none" : `transform ${TRANSITION_FAST}`,
        ...REDUCED_MOTION_SX,
        pointerEvents: "none",
      }}>
        {children}
      </Box>
    </Box>
  );
}
