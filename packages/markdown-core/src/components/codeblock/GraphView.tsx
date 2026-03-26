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

export function GraphView({ code, enabled, isDark, width, height, fill }: GraphViewProps) {
  const { graphExpr, loading, error, jsxGraph, plotly } = useGraphRender({ code, enabled, isDark });

  const fillRef = useRef<HTMLDivElement>(null);
  const [fillSize, setFillSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!fill || !enabled || !fillRef.current) return;
    const el = fillRef.current;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setFillSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fill, enabled]);

  if (!enabled) return null;

  // fill モードでは常に同じ外側コンテナを描画し、中身を切り替える
  if (fill) {
    const resolvedWidth = fillSize?.width;
    const resolvedHeight = fillSize?.height;

    let content: React.ReactNode;
    if (loading) {
      content = (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, height: "100%" }}>
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">グラフライブラリを読み込み中...</Typography>
        </Box>
      );
    } else if (error) {
      content = <Alert severity="info" sx={{ mx: 1, my: 0.5 }}>{error}</Alert>;
    } else if (graphExpr && fillSize) {
      const is3d = graphExpr.type === "surface3d" || graphExpr.type === "parametric3d";
      if (is3d && plotly) {
        content = <Graph3DView graphExpr={graphExpr} plotly={plotly} isDark={isDark} width={resolvedWidth} height={resolvedHeight} />;
      } else if (!is3d && jsxGraph) {
        content = <Graph2DView graphExpr={graphExpr} jsxGraph={jsxGraph} isDark={isDark} width={resolvedWidth} height={resolvedHeight} />;
      }
    }

    return (
      <Box ref={fillRef} sx={{ width: "100%", height: "100%", minHeight: 200 }}>
        {content}
      </Box>
    );
  }

  // 非fill モード（インライン表示）
  if (loading) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 2 }}>
        <CircularProgress size={20} />
        <Typography variant="body2" color="text.secondary">グラフライブラリを読み込み中...</Typography>
      </Box>
    );
  }

  if (error) {
    return <Alert severity="info" sx={{ mx: 1, my: 0.5 }}>{error}</Alert>;
  }

  if (!graphExpr) return null;

  const is3d = graphExpr.type === "surface3d" || graphExpr.type === "parametric3d";

  if (is3d && plotly) {
    return <Graph3DView graphExpr={graphExpr} plotly={plotly} isDark={isDark} width={width} height={height} />;
  }

  if (!is3d && jsxGraph) {
    return <Graph2DView graphExpr={graphExpr} jsxGraph={jsxGraph} isDark={isDark} width={width} height={height} />;
  }

  return null;
}
