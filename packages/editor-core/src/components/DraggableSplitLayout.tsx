import { Box, Divider, useMediaQuery, useTheme } from "@mui/material";
import React, { useEffect, useRef, useState } from "react";

import { FS_CODE_INITIAL_WIDTH, FS_CODE_MIN_WIDTH } from "../constants/dimensions";
import { SPLITTER_SX } from "../constants/uiPatterns";

interface DraggableSplitLayoutProps {
  /** Initial code panel width in px (default: FS_CODE_INITIAL_WIDTH) */
  initialWidth?: number;
  /** Initial code panel width as percentage of container (overrides initialWidth on mount) */
  initialPercent?: number;
  /** Left panel content (code editor) */
  left: React.ReactNode;
  /** Right panel content (preview) */
  right: React.ReactNode;
  /** Pointer move handler forwarded to container (for zoom pan) */
  onPointerMove?: (e: React.PointerEvent) => void;
  /** Pointer up handler forwarded to container (for zoom pan) */
  onPointerUp?: (e: React.PointerEvent) => void;
  t: (key: string) => string;
}

/**
 * ドラッグ可能なスプリッターで左右パネルを分割するレイアウト。
 * 編集ダイアログのコード / プレビュー分割に使用。
 */
export function DraggableSplitLayout({
  initialWidth, initialPercent, left, right, onPointerMove, onPointerUp, t,
}: DraggableSplitLayoutProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [splitPx, setSplitPx] = useState(initialWidth ?? FS_CODE_INITIAL_WIDTH);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Set initial split as percentage of container width
  useEffect(() => {
    if (initialPercent == null) return;
    requestAnimationFrame(() => {
      if (containerRef.current) {
        const w = containerRef.current.getBoundingClientRect().width;
        if (w > 0) setSplitPx(Math.round(w * initialPercent / 100));
      }
    });
  }, [initialPercent]);

  return (
    <Box
      ref={containerRef}
      sx={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", overflow: "hidden", position: "relative" }}
      onPointerMove={(e: React.PointerEvent) => {
        if (dragging && containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const px = e.clientX - rect.left;
          setSplitPx(Math.min(rect.width - FS_CODE_MIN_WIDTH, Math.max(FS_CODE_MIN_WIDTH, px)));
        }
        if (!dragging) onPointerMove?.(e);
      }}
      onPointerUp={(e: React.PointerEvent) => {
        if (dragging) {
          setDragging(false);
          (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
        } else {
          onPointerUp?.(e);
        }
      }}
    >
      {/* Left panel (code) */}
      <Box sx={{ width: isMobile ? "100%" : `${splitPx}px`, height: isMobile ? "40%" : "auto", minWidth: isMobile ? undefined : FS_CODE_MIN_WIDTH, display: "flex", flexDirection: "column", pointerEvents: dragging ? "none" : "auto" }}>
        {left}
      </Box>
      {/* Draggable divider (desktop only) */}
      <Box
        role="separator"
        aria-orientation="vertical"
        aria-label={t("resizeSplitter")}
        aria-valuenow={splitPx}
        aria-valuemin={FS_CODE_MIN_WIDTH}
        aria-valuemax={1200}
        tabIndex={0}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === "ArrowLeft") {
            setSplitPx((v) => Math.max(FS_CODE_MIN_WIDTH, v - 40));
            e.preventDefault();
          } else if (e.key === "ArrowRight") {
            setSplitPx((v) => v + 40);
            e.preventDefault();
          }
        }}
        onPointerDown={(e: React.PointerEvent) => {
          setDragging(true);
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          e.preventDefault();
        }}
        sx={{ display: isMobile ? "none" : "block", ...SPLITTER_SX }}
      />
      {/* Horizontal divider (mobile only) */}
      <Divider sx={{ display: isMobile ? "block" : "none" }} />
      {/* Right panel (preview) */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {right}
      </Box>
    </Box>
  );
}
