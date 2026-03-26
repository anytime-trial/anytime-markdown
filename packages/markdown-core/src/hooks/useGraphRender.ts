import { useEffect, useRef, useState } from "react";

import { BoundedMap } from "../utils/BoundedMap";
import { type GraphExpr, parseLatexToGraph } from "../utils/latexToExpr";

/** Lazy-load JSXGraph */
let jsxGraphModule: typeof import("jsxgraph") | null = null;
async function getJSXGraph() {
  if (!jsxGraphModule) {
    jsxGraphModule = await import("jsxgraph");
  }
  return jsxGraphModule;
}

/** Lazy-load Plotly */
let plotlyModule: typeof import("plotly.js-gl3d-dist-min") | null = null;
async function getPlotly() {
  if (!plotlyModule) {
    plotlyModule = await import("plotly.js-gl3d-dist-min");
  }
  return plotlyModule;
}

/** パース結果キャッシュ */
const exprCache = new BoundedMap<string, GraphExpr>(64);

export interface UseGraphRenderParams {
  code: string;
  enabled: boolean;
  isDark: boolean;
}

export interface UseGraphRenderResult {
  graphExpr: GraphExpr | null;
  loading: boolean;
  error: string;
  jsxGraph: typeof import("jsxgraph") | null;
  plotly: typeof import("plotly.js-gl3d-dist-min") | null;
}

export function useGraphRender({ code, enabled }: UseGraphRenderParams): UseGraphRenderResult {
  const [graphExpr, setGraphExpr] = useState<GraphExpr | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [jsxGraph, setJsxGraph] = useState<typeof import("jsxgraph") | null>(null);
  const [plotly, setPlotly] = useState<typeof import("plotly.js-gl3d-dist-min") | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!enabled || !code.trim()) {
      setGraphExpr(null);
      setError("");
      return;
    }

    let expr = exprCache.get(code);
    if (!expr) {
      expr = parseLatexToGraph(code);
      exprCache.set(code, expr);
    }

    if (expr.type === "unknown") {
      setGraphExpr(null);
      setError(expr.error || "この数式はグラフ化できません");
      setLoading(false);
      return;
    }

    setGraphExpr(expr);
    setError("");

    const is3d = expr.type === "surface3d" || expr.type === "parametric3d";
    setLoading(true);

    const loadLib = is3d ? getPlotly() : getJSXGraph();
    loadLib.then((mod) => {
      if (!mountedRef.current) return;
      if (is3d) {
        setPlotly(mod as typeof import("plotly.js-gl3d-dist-min"));
      } else {
        setJsxGraph(mod as typeof import("jsxgraph"));
      }
      setLoading(false);
    }).catch((err) => {
      if (!mountedRef.current) return;
      setError(`ライブラリの読み込みに失敗しました: ${err instanceof Error ? err.message : "unknown"}`);
      setLoading(false);
    });
  }, [code, enabled]);

  return { graphExpr, loading, error, jsxGraph, plotly };
}
