"use client";

import HomeIcon from "@mui/icons-material/Home";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { Box, IconButton, Slider, Tooltip, Typography } from "@mui/material";
import React, { useCallback, useEffect, useId, useRef, useState } from "react";

import { getTextSecondary } from "../../constants/colors";
import type { GraphExpr } from "../../utils/latexToExpr";

/** デフォルト表示範囲 */
const DEFAULT_BBOX: [number, number, number, number] = [-10, 10, 10, -10];

/** パラメータスライダーのデフォルト範囲・ステップ */
const PARAM_DEFAULT_RANGE: [number, number] = [-5, 5];
const PARAM_STEP = 0.1;

export interface Graph2DViewProps {
  graphExpr: GraphExpr;
  jsxGraph: typeof import("jsxgraph");
  isDark: boolean;
  width?: number;
  height?: number;
}

export function Graph2DView({ graphExpr, jsxGraph, isDark, width = 500, height = 400 }: Graph2DViewProps) {
  const containerId = useId();
  const stableId = `graph2d-${containerId.replace(/:/g, "")}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<JXG.Board | null>(null);

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

  const strokeColor = isDark ? "#90caf9" : "#1976d2";

  /** paramValuesRef: renderBoard内でクロージャ経由で最新値を参照 */
  const paramValuesRef = useRef(paramValues);

  /** paramValues変更時にrefを同期し、ボードを軽量更新 */
  useEffect(() => {
    paramValuesRef.current = paramValues;
    boardRef.current?.update();
  }, [paramValues]);

  /** ボードの初期化 */
  const renderBoard = useCallback(() => {
    if (!containerRef.current) return;

    // 既存ボードの破棄
    if (boardRef.current) {
      jsxGraph.JSXGraph.freeBoard(boardRef.current);
      boardRef.current = null;
    }

    const board = jsxGraph.JSXGraph.initBoard(stableId, {
      boundingbox: [...DEFAULT_BBOX],
      axis: true,
      grid: true,
      showNavigation: false,
      showCopyright: false,
      keepAspectRatio: false,
    });
    boardRef.current = board;

    const evalFn = graphExpr.evaluate;

    try {
      switch (graphExpr.type) {
        case "explicit2d": {
          board.create("functiongraph", [
            (x: number) => evalFn({ ...paramValuesRef.current, x }) as number,
            DEFAULT_BBOX[0],
            DEFAULT_BBOX[2],
          ], { strokeColor, strokeWidth: 2 });
          break;
        }
        case "polar": {
          const xFn = (theta: number) => {
            const r = evalFn({ ...paramValuesRef.current, theta }) as number;
            return r * Math.cos(theta);
          };
          const yFn = (theta: number) => {
            const r = evalFn({ ...paramValuesRef.current, theta }) as number;
            return r * Math.sin(theta);
          };
          board.create("curve", [xFn, yFn, 0, 2 * Math.PI], {
            curveType: "parameter",
            strokeColor,
            strokeWidth: 2,
          } as JXG.CurveAttributes);
          break;
        }
        case "parametric2d": {
          const tMin = -10;
          const tMax = 10;
          const xParam = (t: number) => {
            const result = evalFn({ ...paramValuesRef.current, t });
            return typeof result === "object" && result !== null ? (result as Record<string, number>).x : 0;
          };
          const yParam = (t: number) => {
            const result = evalFn({ ...paramValuesRef.current, t });
            return typeof result === "object" && result !== null ? (result as Record<string, number>).y : 0;
          };
          board.create("curve", [xParam, yParam, tMin, tMax], {
            curveType: "parameter",
            strokeColor,
            strokeWidth: 2,
          } as JXG.CurveAttributes);
          break;
        }
        case "implicit2d": {
          board.create("implicitcurve", [
            (x: number, y: number) => evalFn({ ...paramValuesRef.current, x, y }) as number,
          ], { strokeColor, strokeWidth: 2 });
          break;
        }
      }
    } catch {
      // 評価エラーは無視（不正な値域など）
    }
  }, [graphExpr, jsxGraph, stableId, strokeColor]);

  /** 初回マウント・依存変更時にボードを再描画 */
  useEffect(() => {
    renderBoard();
    return () => {
      if (boardRef.current) {
        jsxGraph.JSXGraph.freeBoard(boardRef.current);
        boardRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderBoard]);

  /** ホームボタン: デフォルト表示範囲に戻す */
  const handleReset = useCallback(() => {
    if (boardRef.current) {
      boardRef.current.setBoundingBox(DEFAULT_BBOX, true);
    }
  }, []);

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
      {/* ツールバー */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Tooltip title="表示範囲をリセット">
          <IconButton size="small" onClick={handleReset} aria-label="表示範囲をリセット">
            <HomeIcon sx={{ fontSize: 18, color: getTextSecondary(isDark) }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* グラフ描画エリア */}
      <div
        id={stableId}
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
