"use client";

import React, { useEffect, useRef, useState } from "react";

import { getTextSecondary } from "@anytime-markdown/markdown-viewer";
import { Spinner } from "@anytime-markdown/markdown-viewer/src/ui/Spinner";
import { Text } from "@anytime-markdown/markdown-viewer/src/ui/Text";
import { InlineAlert } from "../InlineAlert";
import { useGraphRender } from "../../hooks/useGraphRender";
import type { GraphExpr } from "../../utils/latexToExpr";
import { Graph2DView } from "./Graph2DView";
import { Graph3DView } from "./Graph3DView";
import styles from "./GraphView.module.css";

interface GraphContentProps {
  loading: boolean;
  error: string;
  graphExpr: GraphExpr | null;
  jsxGraph: typeof import("jsxgraph") | null;
  plotly: typeof import("plotly.js-gl3d-dist-min") | null;
  isDark: boolean;
  width?: number;
  height?: number;
  fill?: boolean;
}

function GraphContent({
  loading,
  error,
  graphExpr,
  jsxGraph,
  plotly,
  isDark,
  width,
  height,
  fill,
}: Readonly<GraphContentProps>): React.ReactNode {
  if (loading) {
    return (
      <div className={fill ? styles.loadingRowFill : styles.loadingRowPadded}>
        <Spinner size={20} />
        <Text variant="body2" style={{ color: getTextSecondary(isDark) }}>グラフライブラリを読み込み中...</Text>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.alertWrap}>
        <InlineAlert severity="info">{error}</InlineAlert>
      </div>
    );
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

export function GraphView({ code, enabled, isDark, width, height, fill }: Readonly<GraphViewProps>) {
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

  if (fill) {
    return (
      <div ref={fillRef} className={styles.fillContainer}>
        <GraphContent
          loading={loading}
          error={error}
          graphExpr={fillSize ? graphExpr : null}
          jsxGraph={jsxGraph}
          plotly={plotly}
          isDark={isDark}
          width={fillSize?.width}
          height={fillSize?.height}
          fill
        />
      </div>
    );
  }

  return (
    <GraphContent
      loading={loading}
      error={error}
      graphExpr={graphExpr}
      jsxGraph={jsxGraph}
      plotly={plotly}
      isDark={isDark}
      width={width}
      height={height}
    />
  );
}
