"use client";

import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { Box, IconButton, Slider, Tooltip, Typography } from "@mui/material";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG, getTextSecondary } from "@anytime-markdown/markdown-viewer";
import type { GraphExpr } from "../../utils/latexToExpr";

/** グリッドサイズ */
const GRID_SIZE = 50;

/** デフォルト表示範囲 */
const DEFAULT_RANGE: [number, number] = [-5, 5];

/** パラメータスライダーのデフォルト範囲・ステップ */
const PARAM_DEFAULT_RANGE: [number, number] = [-5, 5];
const PARAM_STEP = 0.1;
/** アニメーション中の WebGL 再描画間隔(ms)。60fps の plotly.react を ~20fps に間引く */
const ANIM_INTERVAL_MS = 50;

type EvalFn = GraphExpr["evaluate"];

/** 線形空間（等差数列）を生成する */
function linspace(min: number, max: number, steps: number): number[] {
  const vals: number[] = [];
  for (let i = 0; i <= steps; i++) {
    vals.push(min + (max - min) * (i / steps));
  }
  return vals;
}

/** surface3d 用プロットデータを生成する */
function buildSurface3dData(
  evalFn: EvalFn,
  vars: Record<string, number>,
  isDark: boolean,
) {
  const xVals = linspace(DEFAULT_RANGE[0], DEFAULT_RANGE[1], GRID_SIZE);
  const yVals = linspace(DEFAULT_RANGE[0], DEFAULT_RANGE[1], GRID_SIZE);

  const zVals: number[][] = [];
  for (let yi = 0; yi <= GRID_SIZE; yi++) {
    const row: number[] = [];
    for (let xi = 0; xi <= GRID_SIZE; xi++) {
      try {
        const z = evalFn({ ...vars, x: xVals[xi], y: yVals[yi] }) as number;
        row.push(Number.isFinite(z) ? z : Number.NaN);
      } catch {
        row.push(Number.NaN);
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
}

/** parametric3d の各点を評価して座標を返す */
function evalParametricPoint(
  evalFn: EvalFn,
  vars: Record<string, number>,
  u: number,
  v: number,
): { x: number; y: number; z: number } {
  try {
    const result = evalFn({ ...vars, u, v });
    if (typeof result === "object" && result !== null) {
      const r = result;
      return {
        x: Number.isFinite(r.x) ? r.x : Number.NaN,
        y: Number.isFinite(r.y) ? r.y : Number.NaN,
        z: Number.isFinite(r.z) ? r.z : Number.NaN,
      };
    }
  } catch {
    // 評価エラーは NaN で代替
  }
  return { x: Number.NaN, y: Number.NaN, z: Number.NaN };
}

/** parametric3d 用プロットデータを生成する */
function buildParametric3dData(
  evalFn: EvalFn,
  vars: Record<string, number>,
  isDark: boolean,
) {
  const uVals = linspace(0, 2 * Math.PI, GRID_SIZE);
  const vVals = linspace(0, Math.PI, GRID_SIZE);

  const xGrid: number[][] = [];
  const yGrid: number[][] = [];
  const zGrid: number[][] = [];

  for (let vi = 0; vi <= GRID_SIZE; vi++) {
    const xRow: number[] = [];
    const yRow: number[] = [];
    const zRow: number[] = [];

    for (let ui = 0; ui <= GRID_SIZE; ui++) {
      const pt = evalParametricPoint(evalFn, vars, uVals[ui], vVals[vi]);
      xRow.push(pt.x);
      yRow.push(pt.y);
      zRow.push(pt.z);
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

export interface Graph3DViewProps {
  graphExpr: GraphExpr;
  plotly: typeof import("plotly.js-gl3d-dist-min");
  isDark: boolean;
  width?: number;
  height?: number;
}

export function Graph3DView({ graphExpr, plotly, isDark, width = 500, height = 400 }: Readonly<Graph3DViewProps>) {
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
  /** アニメーションの最終ステップ時刻（param ごと）。WebGL 再描画を間引くため */
  const animLastTsRef = useRef<Record<string, number>>({});

  /** paramValuesRef: renderPlot内でクロージャ経由で最新値を参照 */
  const paramValuesRef = useRef(paramValues);
  const plotInitializedRef = useRef(false);

  /** Plotlyデータを生成 */
  const buildPlotData = useCallback(() => {
    const vars = { ...paramValuesRef.current };
    const evalFn = graphExpr.evaluate;

    if (graphExpr.type === "surface3d") {
      return buildSurface3dData(evalFn, vars, isDark);
    }
    if (graphExpr.type === "parametric3d") {
      return buildParametric3dData(evalFn, vars, isDark);
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

    const container = containerRef.current;
    return () => {
      if (container) {
        plotly.purge(container);
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
    // paramValues のみを契機に軽量再描画する。buildPlotData/plotLayout を deps に含めると
    // isDark 変更時に初期化用 effect と二重に plotly.react が走るため意図的に除外する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramValues]);

  /** パラメータ値の更新 */
  const handleParamChange = useCallback((param: string, value: number) => {
    setParamValues((prev) => ({ ...prev, [param]: value }));
  }, []);

  /** アニメーション開始/停止 */
  const toggleAnimation = useCallback((param: string) => {
    const step = (ts: number) => {
      // rAF は ~60fps で発火するが、plotly.react(WebGL) は重いので
      // ANIM_INTERVAL_MS ごとにのみ paramValues を進めて再描画頻度を抑える
      const last = animLastTsRef.current[param] ?? 0;
      if (ts - last >= ANIM_INTERVAL_MS) {
        animLastTsRef.current[param] = ts;
        setParamValues((pv) => {
          const current = pv[param] ?? PARAM_DEFAULT_RANGE[0];
          let next = current + PARAM_STEP;
          if (next > PARAM_DEFAULT_RANGE[1]) next = PARAM_DEFAULT_RANGE[0];
          return { ...pv, [param]: Math.round(next * 10) / 10 };
        });
      }
      animFrameRef.current[param] = requestAnimationFrame(step);
    };
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
        animFrameRef.current[param] = requestAnimationFrame(step);
      }
      return next;
    });
  }, []);

  /** アニメーションのクリーンアップ */
  useEffect(() => {
    const currentAnimFrames = animFrameRef.current;
    return () => {
      for (const id of Object.values(currentAnimFrames)) {
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
                onChange={(_e, v) => handleParamChange(param, v)}
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
