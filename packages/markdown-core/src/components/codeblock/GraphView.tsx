"use client";

import { Alert, Box, CircularProgress, Typography } from "@mui/material";
import React, { useEffect, useRef, useState } from "react";

import { useGraphRender } from "../../hooks/useGraphRender";
import { Graph2DView } from "./Graph2DView";
import { Graph3DView } from "./Graph3DView";

export interface GraphViewProps {
  code: string;
  enabled: boolean;
  isDark: boolean;
  /** 固定幅 (px)。fill=true 時は無視 */
  width?: number;
  /** 固定高さ (px)。fill=true 時は無視 */
  height?: number;
  /** true の場合、親コンテナのサイズに合わせて自動リサイズ */
  fill?: boolean;
}

/** 親コンテナのサイズを ResizeObserver で追跡する */
function useContainerSize(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!enabled || !ref.current) return;
    const el = ref.current;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled]);

  return { ref, size };
}

export function GraphView({ code, enabled, isDark, width, height, fill }: GraphViewProps) {
  const { graphExpr, loading, error, jsxGraph, plotly } = useGraphRender({ code, enabled, isDark });
  const { ref: fillRef, size: fillSize } = useContainerSize(enabled && !!fill);

  if (!enabled) return null;

  // fill モードのラッパー
  const wrapFill = (content: React.ReactNode) => {
    if (!fill) return content;
    return (
      <Box ref={fillRef} sx={{ width: "100%", height: "100%", minHeight: 200 }}>
        {fillSize ? content : null}
      </Box>
    );
  };

  if (loading) {
    return wrapFill(
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, p: 2, height: "100%" }}>
        <CircularProgress size={20} />
        <Typography variant="body2" color="text.secondary">
          グラフライブラリを読み込み中...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return wrapFill(
      <Alert severity="info" sx={{ mx: 1, my: 0.5 }}>
        {error}
      </Alert>
    );
  }

  if (!graphExpr) return null;

  const resolvedWidth = fill && fillSize ? fillSize.width : width;
  const resolvedHeight = fill && fillSize ? fillSize.height - 40 : height;

  const is3d = graphExpr.type === "surface3d" || graphExpr.type === "parametric3d";

  if (is3d && plotly) {
    return wrapFill(
      <Graph3DView
        graphExpr={graphExpr}
        plotly={plotly}
        isDark={isDark}
        width={resolvedWidth}
        height={resolvedHeight}
      />
    );
  }

  if (!is3d && jsxGraph) {
    return wrapFill(
      <Graph2DView
        graphExpr={graphExpr}
        jsxGraph={jsxGraph}
        isDark={isDark}
        width={resolvedWidth}
        height={resolvedHeight}
      />
    );
  }

  return null;
}
