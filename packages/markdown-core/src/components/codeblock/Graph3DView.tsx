"use client";

import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { Box, IconButton, Slider, Tooltip, Typography } from "@mui/material";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG, getTextSecondary } from "../../constants/colors";
import type { GraphExpr } from "../../utils/latexToExpr";

/** グリッドサイズ */
const GRID_SIZE = 50;

/** デフォルト表示範囲 */
const DEFAULT_RANGE: [number, number] = [-5, 5];

/** パラメータスライダーのデフォルト範囲・ステップ */
const PARAM_DEFAULT_RANGE: [number, number] = [-5, 5];
const PARAM_STEP = 0.1;

export interface Graph3DViewProps {
  graphExpr: GraphExpr;
  plotly: typeof import("plotly.js-gl3d-dist-min");
  isDark: boolean;
  width?: number;
  height?: number;
}

export function Graph3DView({ graphExpr, plotly, isDark, width = 500, height = 400 }: Graph3DViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  /** パラメータ値の状態 */
  const [paramValues, setParamValues] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const p of graphExpr.parameters) {
      init[p] = 1;
    }
    return init;
  });

  /** アニメーション中のパラメータ */
  const [animating, setAnimating] = useState<Record<string, boolean>>({});
  const animFrameRef = useRef<Record<string, number>>({});

  /** paramValuesRef: renderPlot内でクロージャ経由で最新値を参照 */
  const paramValuesRef = useRef(paramValues);
  const plotInitializedRef = useRef(false);

  /** Plotlyデータを生成 */
  const buildPlotData = useCallback(() => {
    const vars = { ...paramValuesRef.current };
    const evalFn = graphExpr.evaluate;

    if (graphExpr.type === "surface3d") {
      const xVals: number[] = [];
      const yVals: number[] = [];
      for (let i = 0; i <= GRID_SIZE; i++) {
        const v = DEFAULT_RANGE[0] + (DEFAULT_RANGE[1] - DEFAULT_RANGE[0]) * (i / GRID_SIZE);
        xVals.push(v);
        yVals.push(v);
      }

      const zVals: number[][] = [];
      for (let yi = 0; yi <= GRID_SIZE; yi++) {
        const row: number[] = [];
        for (let xi = 0; xi <= GRID_SIZE; xi++) {
          try {
            const z = evalFn({ ...vars, x: xVals[xi], y: yVals[yi] }) as number;
            row.push(Number.isFinite(z) ? z : NaN);
          } catch {
            row.push(NaN);
          }
        }
        zVals.push(row);
      }

      return [{
        type: "surface" as const,
        x: xVals,
        y: yVals,
        z: zVals,
        colorscale: isDark ? "Viridis" : "YlGnBu",
        showscale: false,
      }];
    } else if (graphExpr.type === "parametric3d") {
      const uMin = 0;
      const uMax = 2 * Math.PI;
      const vMin = 0;
      const vMax = Math.PI;

      const xGrid: number[][] = [];
      const yGrid: number[][] = [];
      const zGrid: number[][] = [];

      for (let vi = 0; vi <= GRID_SIZE; vi++) {
        const v = vMin + (vMax - vMin) * (vi / GRID_SIZE);
        const xRow: number[] = [];
        const yRow: number[] = [];
        const zRow: number[] = [];

        for (let ui = 0; ui <= GRID_SIZE; ui++) {
          const u = uMin + (uMax - uMin) * (ui / GRID_SIZE);
          try {
            const result = evalFn({ ...vars, u, v });
            if (typeof result === "object" && result !== null) {
              const r = result as Record<string, number>;
              xRow.push(Number.isFinite(r.x) ? r.x : NaN);
              yRow.push(Number.isFinite(r.y) ? r.y : NaN);
              zRow.push(Number.isFinite(r.z) ? r.z : NaN);
            } else {
              xRow.push(NaN);
              yRow.push(NaN);
              zRow.push(NaN);
            }
          } catch {
            xRow.push(NaN);
            yRow.push(NaN);
            zRow.push(NaN);
          }
        }

        xGrid.push(xRow);
        yGrid.push(yRow);
        zGrid.push(zRow);
      }

      return [{
        type: "surface" as const,
        x: xGrid,
        y: yGrid,
        z: zGrid,
        colorscale: isDark ? "Viridis" : "YlGnBu",
        showscale: false,
      }];
    }

    return null;
  }, [graphExpr, isDark]);

  /** Plotlyレイアウト */
  const plotLayout = useMemo(() => ({
    width,
    height,
    margin: { l: 0, r: 0, t: 0, b: 0 },
    paper_bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG,
    scene: {
      bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG,
      xaxis: { color: isDark ? "#aaa" : "#333" },
      yaxis: { color: isDark ? "#aaa" : "#333" },
      zaxis: { color: isDark ? "#aaa" : "#333" },
    },
  }), [width, height, isDark]);

  const plotConfig = useMemo(() => ({
    displayModeBar: true,
    modeBarButtonsToRemove: ["toImage", "sendDataToCloud"],
    responsive: true,
  }), []);

  /** 初回マウント・構造変更時にプロット作成 */
  useEffect(() => {
    if (!containerRef.current) return;

    try {
      const data = buildPlotData();
      if (data) {
        plotly.react(containerRef.current, data, plotLayout, plotConfig).catch(() => {
          // Plotly render error - silently ignore
        });
        plotInitializedRef.current = true;
      }
    } catch {
      // 評価エラーは無視
    }

    return () => {
      if (containerRef.current) {
        plotly.purge(containerRef.current);
      }
      plotInitializedRef.current = false;
    };
  }, [buildPlotData, plotly, plotLayout, plotConfig]);

  /** paramValues変更時にrefを同期し、軽量再描画 */
  useEffect(() => {
    paramValuesRef.current = paramValues;
    if (!plotInitializedRef.current || !containerRef.current) return;

    try {
      const data = buildPlotData();
      if (data) {
        plotly.react(containerRef.current, data, plotLayout, plotConfig).catch(() => {
          // Plotly render error - silently ignore
        });
      }
    } catch {
      // 評価エラーは無視
    }
  }, [paramValues, buildPlotData, plotly, plotLayout, plotConfig]);

  /** パラメータ値の更新 */
  const handleParamChange = useCallback((param: string, value: number) => {
    setParamValues((prev) => ({ ...prev, [param]: value }));
  }, []);

  /** アニメーション開始/停止 */
  const toggleAnimation = useCallback((param: string) => {
    setAnimating((prev) => {
      const next = { ...prev };
      if (next[param]) {
        // 停止
        if (animFrameRef.current[param]) {
          cancelAnimationFrame(animFrameRef.current[param]);
          delete animFrameRef.current[param];
        }
        next[param] = false;
      } else {
        // 開始
        next[param] = true;
        const step = () => {
          setParamValues((pv) => {
            const current = pv[param] ?? PARAM_DEFAULT_RANGE[0];
            let next = current + PARAM_STEP;
            if (next > PARAM_DEFAULT_RANGE[1]) next = PARAM_DEFAULT_RANGE[0];
            return { ...pv, [param]: Math.round(next * 10) / 10 };
          });
          animFrameRef.current[param] = requestAnimationFrame(step);
        };
        animFrameRef.current[param] = requestAnimationFrame(step);
      }
      return next;
    });
  }, []);

  /** アニメーションのクリーンアップ */
  useEffect(() => {
    return () => {
      for (const id of Object.values(animFrameRef.current)) {
        cancelAnimationFrame(id);
      }
    };
  }, []);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {/* 3Dグラフ描画エリア */}
      <div
        ref={containerRef}
        style={{ width: `${width}px`, height: `${height}px` }}
      />

      {/* パラメータスライダー */}
      {graphExpr.parameters.length > 0 && (
        <Box sx={{ px: 1, display: "flex", flexDirection: "column", gap: 1 }}>
          {graphExpr.parameters.map((param) => (
            <Box key={param} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="caption" sx={{ minWidth: 24, color: getTextSecondary(isDark) }}>
                {param}
              </Typography>
              <Slider
                size="small"
                min={PARAM_DEFAULT_RANGE[0]}
                max={PARAM_DEFAULT_RANGE[1]}
                step={PARAM_STEP}
                value={paramValues[param] ?? 1}
                onChange={(_e, v) => handleParamChange(param, v as number)}
                sx={{ flex: 1 }}
                aria-label={`パラメータ ${param}`}
              />
              <Typography variant="caption" sx={{ minWidth: 32, textAlign: "right", color: getTextSecondary(isDark) }}>
                {(paramValues[param] ?? 1).toFixed(1)}
              </Typography>
              <Tooltip title={animating[param] ? "停止" : "再生"}>
                <IconButton size="small" onClick={() => toggleAnimation(param)} aria-label={animating[param] ? `${param} 停止` : `${param} 再生`}>
                  {animating[param]
                    ? <PauseIcon sx={{ fontSize: 16, color: getTextSecondary(isDark) }} />
                    : <PlayArrowIcon sx={{ fontSize: 16, color: getTextSecondary(isDark) }} />
                  }
                </IconButton>
              </Tooltip>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
