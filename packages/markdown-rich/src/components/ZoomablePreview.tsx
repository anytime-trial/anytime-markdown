import React from "react";

import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG, DURATION_FAST, useIsDark } from "@anytime-markdown/markdown-viewer";
import type { UseZoomPanReturn } from "../hooks/useZoomPan";

import styles from "./ZoomablePreview.module.css";

interface ZoomablePreviewProps {
  fsZP: UseZoomPanReturn;
  children: React.ReactNode;
  /** Transform origin: "center center" (default) or "top left" */
  origin?: "center" | "top-left";
}

/** ズーム・パン対応のプレビューコンテナ */
export function ZoomablePreview({ fsZP, children, origin = "center" }: Readonly<ZoomablePreviewProps>) {
  const isDark = useIsDark();
  const transformOrigin = origin === "top-left" ? "top left" : "center center";
  const justify = origin === "top-left" ? "flex-start" : "center";
  const align = origin === "top-left" ? "flex-start" : "center";

  return (
    <div
      className={styles.outer}
      style={{ backgroundColor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG }}
      onPointerDown={fsZP.handlePointerDown}
      onPointerMove={fsZP.handlePointerMove}
      onPointerUp={fsZP.handlePointerUp}
      onPointerCancel={fsZP.handlePointerCancel}
      onWheel={fsZP.handleWheel}
    >
      <div
        className={styles.inner}
        style={{
          justifyContent: justify,
          alignItems: align,
          transform: `translate(${fsZP.pan.x}px, ${fsZP.pan.y}px) scale(${fsZP.zoom})`,
          transformOrigin,
          transition: fsZP.isPanningRef.current ? "none" : `transform ${DURATION_FAST}`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
