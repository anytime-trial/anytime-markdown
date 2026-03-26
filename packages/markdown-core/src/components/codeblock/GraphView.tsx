"use client";

import { Alert, Box, CircularProgress, Typography } from "@mui/material";
import React from "react";

import { useGraphRender } from "../../hooks/useGraphRender";
import { Graph2DView } from "./Graph2DView";
import { Graph3DView } from "./Graph3DView";

export interface GraphViewProps {
  code: string;
  enabled: boolean;
  isDark: boolean;
  width?: number;
  height?: number;
}

export function GraphView({ code, enabled, isDark, width, height }: GraphViewProps) {
  const { graphExpr, loading, error, jsxGraph, plotly } = useGraphRender({ code, enabled, isDark });

  if (!enabled) return null;

  if (loading) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 2 }}>
        <CircularProgress size={20} />
        <Typography variant="body2" color="text.secondary">
          グラフライブラリを読み込み中...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="info" sx={{ mx: 1, my: 0.5 }}>
        {error}
      </Alert>
    );
  }

  if (!graphExpr) return null;

  const is3d = graphExpr.type === "surface3d" || graphExpr.type === "parametric3d";

  if (is3d && plotly) {
    return (
      <Graph3DView
        graphExpr={graphExpr}
        plotly={plotly}
        isDark={isDark}
        width={width}
        height={height}
      />
    );
  }

  if (!is3d && jsxGraph) {
    return (
      <Graph2DView
        graphExpr={graphExpr}
        jsxGraph={jsxGraph}
        isDark={isDark}
        width={width}
        height={height}
      />
    );
  }

  return null;
}
