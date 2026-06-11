/**
 * graphRender.ts — useGraphRender.ts の vanilla コントローラ移植。
 *
 * React の useState / useEffect を排除し、コールバックベースの非同期ステートマシンとして再実装。
 * 遅延 import (mathjs / jsxgraph / plotly) とキャッシュ（BoundedMap）は React 版と同一。
 */

import { BoundedMap } from "../utils/BoundedMap";
import type { GraphExpr } from "../utils/latexToExpr";

// ===== 遅延ロード（モジュールレベルキャッシュ）=====

/** Lazy-load latexToExpr (mathjs ~180KB を含む) */
let parseLatexToGraphFn:
  | typeof import("../utils/latexToExpr").parseLatexToGraph
  | null = null;
async function getParser(): Promise<
  typeof import("../utils/latexToExpr").parseLatexToGraph
> {
  if (!parseLatexToGraphFn) {
    parseLatexToGraphFn = (
      await import("../utils/latexToExpr")
    ).parseLatexToGraph;
  }
  return parseLatexToGraphFn;
}

/** Lazy-load JSXGraph */
let jsxGraphModule: typeof import("jsxgraph") | null = null;
async function getJSXGraph(): Promise<typeof import("jsxgraph")> {
  if (!jsxGraphModule) {
    jsxGraphModule = await import("jsxgraph");
  }
  return jsxGraphModule;
}

/** Lazy-load Plotly */
let plotlyModule: typeof import("plotly.js-gl3d-dist-min") | null = null;
async function getPlotly(): Promise<
  typeof import("plotly.js-gl3d-dist-min")
> {
  if (!plotlyModule) {
    plotlyModule = await import("plotly.js-gl3d-dist-min");
  }
  return plotlyModule;
}

/** パース結果キャッシュ（最大 64 エントリ）*/
const exprCache = new BoundedMap<string, GraphExpr>(64);

// ===== 公開型 =====

/** グラフレンダリング状態 */
export interface GraphRenderState {
  graphExpr: GraphExpr | null;
  loading: boolean;
  error: string;
  jsxGraph: typeof import("jsxgraph") | null;
  plotly: typeof import("plotly.js-gl3d-dist-min") | null;
}

/** 状態変化コールバック */
export type GraphRenderCallback = (state: GraphRenderState) => void;

/** parseGraphCode の戻り値ハンドル */
export interface GraphRenderHandle {
  /** 非同期処理を中断して破棄する */
  cancel(): void;
}

// ===== コントローラ =====

/**
 * code をパースしてグラフ expr + 描画ライブラリを非同期ロードし、
 * 状態変化のたびに `onStateChange` を呼び出す。
 *
 * enabled=false または code が空白のみの場合は即座に空状態を通知して終了する。
 * キャンセル後のコールバック呼び出しは保証しない。
 */
export function parseGraphCode(
  code: string,
  enabled: boolean,
  onStateChange: GraphRenderCallback,
): GraphRenderHandle {
  const initialState: GraphRenderState = {
    graphExpr: null,
    loading: false,
    error: "",
    jsxGraph: null,
    plotly: null,
  };

  if (!enabled || !code.trim()) {
    onStateChange(initialState);
    return { cancel() {} };
  }

  let cancelled = false;

  onStateChange({ ...initialState, loading: true });

  (async () => {
    try {
      // パーサー（+ mathjs）を動的ロード
      const parseLatex = await getParser();
      if (cancelled) return;

      let expr = exprCache.get(code);
      if (!expr) {
        expr = parseLatex(code);
        exprCache.set(code, expr);
      }

      if (expr.type === "unknown") {
        onStateChange({
          graphExpr: null,
          loading: false,
          error: expr.error || "この数式はグラフ化できません",
          jsxGraph: null,
          plotly: null,
        });
        return;
      }

      onStateChange({
        graphExpr: expr,
        loading: true,
        error: "",
        jsxGraph: null,
        plotly: null,
      });

      // 描画ライブラリを動的ロード
      const is3d =
        expr.type === "surface3d" || expr.type === "parametric3d";
      const mod = is3d ? await getPlotly() : await getJSXGraph();
      if (cancelled) return;

      if (is3d) {
        onStateChange({
          graphExpr: expr,
          loading: false,
          error: "",
          jsxGraph: null,
          plotly: mod as typeof import("plotly.js-gl3d-dist-min"),
        });
      } else {
        onStateChange({
          graphExpr: expr,
          loading: false,
          error: "",
          jsxGraph: mod as typeof import("jsxgraph"),
          plotly: null,
        });
      }
    } catch (err) {
      if (cancelled) return;
      const msg =
        err instanceof Error ? err.message : "unknown";
      console.error(
        `[${new Date().toISOString()}] [graphRender] ライブラリ読み込みエラー:`,
        err instanceof Error ? err.stack ?? err.message : err,
      );
      onStateChange({
        graphExpr: null,
        loading: false,
        error: `ライブラリの読み込みに失敗しました: ${msg}`,
        jsxGraph: null,
        plotly: null,
      });
    }
  })();

  return {
    cancel() {
      cancelled = true;
    },
  };
}
