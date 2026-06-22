/**
 * createGraphPreview.ts — GraphView / Graph2DView / Graph3DView の vanilla DOM 移植。
 *
 * GraphMountHandle 契約（previewContracts.ts）を満たす。
 * UI プリミティブは @anytime-markdown/markdown-viewer の ui-vanilla を使用する。
 * CSS は ensureStyle でインジェクトする（module.css を文字列化移植）。
 */

import {
  getInfoBg,
  getInfoMain,
  getTextSecondary,
  DEFAULT_DARK_BG,
  DEFAULT_LIGHT_BG,
} from "@anytime-markdown/markdown-viewer/src/constants/colors";
import {
  appendContent,
  ensureStyle,
  nextId,
  svgIcon,
} from "@anytime-markdown/ui-core/dom";
import {
  createIconButton,
} from "@anytime-markdown/ui-core/IconButton";
import {
  createSlider,
} from "@anytime-markdown/ui-core/Slider";
import {
  createSpinner,
} from "@anytime-markdown/ui-core/Spinner";
import {
  createTooltip,
} from "@anytime-markdown/ui-core/Tooltip";

import type { GraphMountHandle } from "../components/codeblock/previewContracts";
import type { GraphExpr } from "../utils/latexToExpr";
import { parseGraphCode } from "./graphRender";
import type { GraphRenderState } from "./graphRender";

// ===== SVG アイコンパス（Material Icons）=====
const ICON_HOME = "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z";
const ICON_PLAY = "M8 5v14l11-7z";
const ICON_PAUSE = "M6 19h4V5H6zm8-14v14h4V5z";

// ===== 定数 =====
const DEFAULT_BBOX: [number, number, number, number] = [-10, 10, 10, -10];
const PARAM_DEFAULT_RANGE: [number, number] = [-5, 5];
const PARAM_STEP = 0.1;
const GRID_SIZE = 50;
const DEFAULT_RANGE: [number, number] = [-5, 5];
const ANIM_INTERVAL_MS = 50;

// ===== CSS インジェクション =====
const STYLE_ID = "am-graph-preview-css";
const GRAPH_CSS = `
.am-graph-root { display:flex; flex-direction:column; gap:8px; }
.am-graph-toolbar { display:flex; align-items:center; gap:4px; }
.am-graph-slider-list { padding-left:8px; padding-right:8px; display:flex; flex-direction:column; gap:8px; }
.am-graph-slider-row { display:flex; align-items:center; gap:8px; }
.am-graph-param-label { min-width:24px; font-size:0.75rem; }
.am-graph-param-value { min-width:32px; text-align:right; font-size:0.75rem; }
.am-graph-slider-flex { flex:1; }
.am-graph-fill-container { width:100%; height:100%; min-height:200px; }
.am-graph-loading-row-fill { display:flex; align-items:center; justify-content:center; gap:8px; height:100%; }
.am-graph-loading-row-padded { display:flex; align-items:center; gap:8px; padding:16px; }
.am-graph-alert-wrap { margin:4px 8px; }
.am-graph-inline-alert { display:flex; padding:6px 16px; border-radius:4px; font-size:0.875rem; line-height:1.43; }
.am-graph-inline-alert-icon { display:flex; margin-right:12px; padding:7px 0; opacity:0.9; }
.am-graph-inline-alert-msg { padding:8px 0; min-width:0; overflow:auto; }
`;

function ensureGraphStyles(): void {
  ensureStyle(STYLE_ID, GRAPH_CSS);
}

// ===== 数値ユーティリティ =====

function linspace(min: number, max: number, steps: number): number[] {
  const vals: number[] = [];
  for (let i = 0; i <= steps; i++) {
    vals.push(min + (max - min) * (i / steps));
  }
  return vals;
}

// ===== インラインアラート（info 固定）=====

function createInlineAlert(message: string, isDark: boolean): HTMLElement {
  const root = document.createElement("div");
  root.className = "am-graph-inline-alert";
  root.setAttribute("role", "alert");
  root.style.backgroundColor = getInfoBg(isDark);
  root.style.color = getInfoMain(isDark);

  // info アイコン（Material InfoOutlined パス）
  const INFO_PATH = "M11 7h2v2h-2zm0 4h2v6h-2zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z";
  const iconEl = document.createElement("span");
  iconEl.className = "am-graph-inline-alert-icon";
  iconEl.style.color = getInfoMain(isDark);
  iconEl.appendChild(svgIcon(INFO_PATH, 22));
  root.appendChild(iconEl);

  const msgEl = document.createElement("span");
  msgEl.className = "am-graph-inline-alert-msg";
  msgEl.textContent = message;
  root.appendChild(msgEl);
  return root;
}

// ===== 2D グラフコントロール =====

interface Graph2DHandle {
  el: HTMLElement;
  destroy(): void;
}

function createGraph2DControls(
  graphExpr: GraphExpr,
  jsxGraph: typeof import("jsxgraph"),
  width: number,
  height: number,
  isDark: boolean,
): Graph2DHandle {
  const root = document.createElement("div");
  root.className = "am-graph-root";

  const strokeColor = isDark ? "#90caf9" : "#1976d2";
  const textSecondary = getTextSecondary(isDark);

  // パラメータ値（closure）
  const paramValues: Record<string, number> = {};
  for (const p of graphExpr.parameters) paramValues[p] = 1;

  const animFrames: Record<string, number> = {};
  const animating: Record<string, boolean> = {};

  // ユニーク ID（共有 nextId で決定論的に採番・テスト再現可）
  const stableId = nextId("am-graph2d");

  // ツールバー
  const toolbar = document.createElement("div");
  toolbar.className = "am-graph-toolbar";

  const resetBtn = createIconButton({
    size: "small",
    ariaLabel: "表示範囲をリセット",
    children: svgIcon(ICON_HOME, 18),
  });
  resetBtn.el.style.color = textSecondary;
  const resetTooltip = createTooltip({
    reference: resetBtn.el,
    title: "表示範囲をリセット",
  });
  toolbar.appendChild(resetBtn.el);
  root.appendChild(toolbar);

  // グラフエリア
  const boardEl = document.createElement("div");
  boardEl.id = stableId;
  boardEl.style.width = `${width}px`;
  boardEl.style.height = `${height}px`;
  root.appendChild(boardEl);

  // JSXGraph ボード初期化
  let board: JXG.Board | null = null;

  function renderBoard(): void {
    if (board) {
      jsxGraph.JSXGraph.freeBoard(board);
      board = null;
    }
    board = jsxGraph.JSXGraph.initBoard(stableId, {
      boundingbox: [...DEFAULT_BBOX],
      axis: true,
      grid: true,
      showNavigation: false,
      showCopyright: false,
      keepAspectRatio: false,
    });
    const evalFn = graphExpr.evaluate;

    try {
      switch (graphExpr.type) {
        case "explicit2d": {
          board.create("functiongraph", [
            (x: number) => evalFn({ ...paramValues, x }) as number,
            DEFAULT_BBOX[0],
            DEFAULT_BBOX[2],
          ], { strokeColor, strokeWidth: 2 });
          break;
        }
        case "polar": {
          let lastTheta: number | undefined;
          let lastR = 0;
          const evalR = (theta: number) => {
            if (theta !== lastTheta) {
              lastR = evalFn({ ...paramValues, theta }) as number;
              lastTheta = theta;
            }
            return lastR;
          };
          board.create("curve", [
            (theta: number) => evalR(theta) * Math.cos(theta),
            (theta: number) => evalR(theta) * Math.sin(theta),
            0,
            2 * Math.PI,
          ], { curveType: "parameter", strokeColor, strokeWidth: 2 });
          break;
        }
        case "parametric2d": {
          let lastT: number | undefined;
          let lastRes: ReturnType<typeof evalFn>;
          const evalP = (t: number) => {
            if (t !== lastT) { lastRes = evalFn({ ...paramValues, t }); lastT = t; }
            return lastRes;
          };
          board.create("curve", [
            (t: number) => { const r = evalP(t); return typeof r === "object" && r !== null ? r.x : 0; },
            (t: number) => { const r = evalP(t); return typeof r === "object" && r !== null ? r.y : 0; },
            -10,
            10,
          ], { curveType: "parameter", strokeColor, strokeWidth: 2 });
          break;
        }
        case "implicit2d": {
          board.create("implicitcurve", [
            (x: number, y: number) => evalFn({ ...paramValues, x, y }) as number,
          ], { strokeColor, strokeWidth: 2 });
          break;
        }
      }
    } catch {
      // 評価エラーは無視（不正な値域など）
    }
  }
  renderBoard();

  // リセットボタン
  resetBtn.update({
    onClick: () => {
      board?.setBoundingBox(DEFAULT_BBOX, true);
    },
  });

  // パラメータスライダー
  const sliderDestroys: (() => void)[] = [];

  if (graphExpr.parameters.length > 0) {
    const sliderList = document.createElement("div");
    sliderList.className = "am-graph-slider-list";

    for (const param of graphExpr.parameters) {
      const row = document.createElement("div");
      row.className = "am-graph-slider-row";

      const labelEl = document.createElement("span");
      labelEl.className = "am-graph-param-label";
      labelEl.style.color = textSecondary;
      labelEl.textContent = param;

      const sliderWrap = document.createElement("div");
      sliderWrap.className = "am-graph-slider-flex";

      const slider = createSlider({
        min: PARAM_DEFAULT_RANGE[0],
        max: PARAM_DEFAULT_RANGE[1],
        step: PARAM_STEP,
        value: paramValues[param] ?? 1,
        size: "small",
        ariaLabel: `パラメータ ${param}`,
        onChange: (v) => {
          paramValues[param] = v;
          valueText.textContent = v.toFixed(1);
          board?.update();
        },
      });
      sliderWrap.appendChild(slider.el);

      const valueText = document.createElement("span");
      valueText.className = "am-graph-param-value";
      valueText.style.color = textSecondary;
      valueText.textContent = (paramValues[param] ?? 1).toFixed(1);

      const playBtn = createIconButton({
        size: "small",
        ariaLabel: `${param} 再生`,
        children: svgIcon(ICON_PLAY, 16),
      });
      playBtn.el.style.color = textSecondary;

      const playTooltip = createTooltip({
        reference: playBtn.el,
        title: "再生",
      });

      const toggleAnim = () => {
        if (animating[param]) {
          if (animFrames[param]) { cancelAnimationFrame(animFrames[param]); delete animFrames[param]; }
          animating[param] = false;
          playBtn.update({ ariaLabel: `${param} 再生`, children: svgIcon(ICON_PLAY, 16) });
          playTooltip.update({ title: "再生" });
        } else {
          animating[param] = true;
          playBtn.update({ ariaLabel: `${param} 停止`, children: svgIcon(ICON_PAUSE, 16) });
          playTooltip.update({ title: "停止" });
          const step = () => {
            const current = paramValues[param] ?? PARAM_DEFAULT_RANGE[0];
            let next = current + PARAM_STEP;
            if (next > PARAM_DEFAULT_RANGE[1]) next = PARAM_DEFAULT_RANGE[0];
            const rounded = Math.round(next * 10) / 10;
            paramValues[param] = rounded;
            slider.update({ value: rounded });
            valueText.textContent = rounded.toFixed(1);
            board?.update();
            animFrames[param] = requestAnimationFrame(step);
          };
          animFrames[param] = requestAnimationFrame(step);
        }
      };
      playBtn.update({ onClick: toggleAnim });

      row.appendChild(labelEl);
      row.appendChild(sliderWrap);
      row.appendChild(valueText);
      row.appendChild(playBtn.el);
      sliderList.appendChild(row);

      sliderDestroys.push(() => {
        if (animFrames[param]) cancelAnimationFrame(animFrames[param]);
        slider.destroy();
        playBtn.destroy();
        playTooltip.destroy();
      });
    }
    root.appendChild(sliderList);
  }

  return {
    el: root,
    destroy() {
      for (const id of Object.values(animFrames)) cancelAnimationFrame(id);
      for (const d of sliderDestroys) d();
      resetBtn.destroy();
      resetTooltip.destroy();
      if (board) {
        jsxGraph.JSXGraph.freeBoard(board);
        board = null;
      }
    },
  };
}

// ===== 3D グラフコントロール =====

interface Graph3DHandle {
  el: HTMLElement;
  destroy(): void;
}

function createGraph3DControls(
  graphExpr: GraphExpr,
  plotly: typeof import("plotly.js-gl3d-dist-min"),
  width: number,
  height: number,
  isDark: boolean,
): Graph3DHandle {
  const root = document.createElement("div");
  root.className = "am-graph-root";
  const textSecondary = getTextSecondary(isDark);

  const paramValues: Record<string, number> = {};
  for (const p of graphExpr.parameters) paramValues[p] = 1;

  const animFrames: Record<string, number> = {};
  const animLastTs: Record<string, number> = {};
  const animating: Record<string, boolean> = {};
  let plotInitialized = false;

  // 3Dグラフ描画エリア
  const containerEl = document.createElement("div");
  containerEl.style.width = `${width}px`;
  containerEl.style.height = `${height}px`;
  root.appendChild(containerEl);

  const buildPlotLayout = () => ({
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
  });

  const buildConfig = () => ({
    displayModeBar: true,
    modeBarButtonsToRemove: ["toImage", "sendDataToCloud"],
    responsive: true,
  });

  const buildPlotData = () => {
    const vars = { ...paramValues };
    const evalFn = graphExpr.evaluate;
    if (graphExpr.type === "surface3d") {
      return buildSurface3dData(evalFn, vars, isDark);
    }
    if (graphExpr.type === "parametric3d") {
      return buildParametric3dData(evalFn, vars, isDark);
    }
    return null;
  };

  // 初回描画
  try {
    const data = buildPlotData();
    if (data) {
      plotly.react(containerEl, data, buildPlotLayout(), buildConfig()).catch((err: unknown) => {
        console.error(
          `[${new Date().toISOString()}] [createGraphPreview] plotly.react エラー:`,
          err instanceof Error ? err.stack ?? err.message : err,
        );
      });
      plotInitialized = true;
    }
  } catch {
    // 評価エラーは無視
  }

  const redraw = () => {
    if (!plotInitialized) return;
    try {
      const data = buildPlotData();
      if (data) {
        plotly.react(containerEl, data, buildPlotLayout(), buildConfig()).catch((err: unknown) => {
          console.error(
            `[${new Date().toISOString()}] [createGraphPreview] plotly.react 再描画エラー:`,
            err instanceof Error ? err.stack ?? err.message : err,
          );
        });
      }
    } catch {
      // 評価エラーは無視
    }
  };

  // パラメータスライダー
  const sliderDestroys: (() => void)[] = [];

  if (graphExpr.parameters.length > 0) {
    const sliderList = document.createElement("div");
    sliderList.className = "am-graph-slider-list";

    for (const param of graphExpr.parameters) {
      const row = document.createElement("div");
      row.className = "am-graph-slider-row";

      const labelEl = document.createElement("span");
      labelEl.className = "am-graph-param-label";
      labelEl.style.color = textSecondary;
      labelEl.textContent = param;

      const sliderWrap = document.createElement("div");
      sliderWrap.className = "am-graph-slider-flex";

      const valueText = document.createElement("span");
      valueText.className = "am-graph-param-value";
      valueText.style.color = textSecondary;
      valueText.textContent = (paramValues[param] ?? 1).toFixed(1);

      const slider = createSlider({
        min: PARAM_DEFAULT_RANGE[0],
        max: PARAM_DEFAULT_RANGE[1],
        step: PARAM_STEP,
        value: paramValues[param] ?? 1,
        size: "small",
        ariaLabel: `パラメータ ${param}`,
        onChange: (v) => {
          paramValues[param] = v;
          valueText.textContent = v.toFixed(1);
          redraw();
        },
      });
      sliderWrap.appendChild(slider.el);

      const playBtn = createIconButton({
        size: "small",
        ariaLabel: `${param} 再生`,
        children: svgIcon(ICON_PLAY, 16),
      });
      playBtn.el.style.color = textSecondary;

      const playTooltip = createTooltip({
        reference: playBtn.el,
        title: "再生",
      });

      const toggleAnim = () => {
        if (animating[param]) {
          if (animFrames[param]) { cancelAnimationFrame(animFrames[param]); delete animFrames[param]; }
          animating[param] = false;
          playBtn.update({ ariaLabel: `${param} 再生`, children: svgIcon(ICON_PLAY, 16) });
          playTooltip.update({ title: "再生" });
        } else {
          animating[param] = true;
          playBtn.update({ ariaLabel: `${param} 停止`, children: svgIcon(ICON_PAUSE, 16) });
          playTooltip.update({ title: "停止" });
          const step = (ts: number) => {
            const last = animLastTs[param] ?? 0;
            if (ts - last >= ANIM_INTERVAL_MS) {
              animLastTs[param] = ts;
              const current = paramValues[param] ?? PARAM_DEFAULT_RANGE[0];
              let next = current + PARAM_STEP;
              if (next > PARAM_DEFAULT_RANGE[1]) next = PARAM_DEFAULT_RANGE[0];
              const rounded = Math.round(next * 10) / 10;
              paramValues[param] = rounded;
              slider.update({ value: rounded });
              valueText.textContent = rounded.toFixed(1);
              redraw();
            }
            animFrames[param] = requestAnimationFrame(step);
          };
          animFrames[param] = requestAnimationFrame(step);
        }
      };
      playBtn.update({ onClick: toggleAnim });

      row.appendChild(labelEl);
      row.appendChild(sliderWrap);
      row.appendChild(valueText);
      row.appendChild(playBtn.el);
      sliderList.appendChild(row);

      sliderDestroys.push(() => {
        if (animFrames[param]) cancelAnimationFrame(animFrames[param]);
        slider.destroy();
        playBtn.destroy();
        playTooltip.destroy();
      });
    }
    root.appendChild(sliderList);
  }

  return {
    el: root,
    destroy() {
      for (const id of Object.values(animFrames)) cancelAnimationFrame(id);
      for (const d of sliderDestroys) d();
      plotly.purge(containerEl);
      plotInitialized = false;
    },
  };
}

// ===== Plotly データビルダ =====

type EvalFn = GraphExpr["evaluate"];

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
        const v = evalFn({ ...vars, x: xVals[xi], y: yVals[yi] });
        row.push(isFinite(v as number) ? (v as number) : NaN);
      } catch {
        row.push(NaN);
      }
    }
    zVals.push(row);
  }
  return [{ type: "surface", x: xVals, y: yVals, z: zVals, colorscale: isDark ? "Viridis" : "RdBu" }];
}

function buildParametric3dData(
  evalFn: EvalFn,
  vars: Record<string, number>,
  isDark: boolean,
) {
  const uVals = linspace(DEFAULT_RANGE[0], DEFAULT_RANGE[1], GRID_SIZE);
  const vVals = linspace(DEFAULT_RANGE[0], DEFAULT_RANGE[1], GRID_SIZE);
  const xs: number[] = [], ys: number[] = [], zs: number[] = [];
  for (const u of uVals) {
    for (const v of vVals) {
      try {
        const res = evalFn({ ...vars, u, v });
        if (typeof res === "object" && res !== null) {
          xs.push(isFinite(res.x) ? res.x : NaN);
          ys.push(isFinite(res.y) ? res.y : NaN);
          zs.push(isFinite((res as any).z) ? (res as any).z : NaN);
        } else {
          xs.push(NaN); ys.push(NaN); zs.push(NaN);
        }
      } catch {
        xs.push(NaN); ys.push(NaN); zs.push(NaN);
      }
    }
  }
  const color = isDark ? "#90caf9" : "#1976d2";
  return [{ type: "scatter3d", mode: "lines", x: xs, y: ys, z: zs, line: { color, width: 2 } }];
}

// ===== メインファクトリ =====

/**
 * グラフプレビューを生成する。
 *
 * @returns GraphMountHandle — render(code, enabled, isDark) と destroy() を持つ。
 */
export function createGraphPreview(container: HTMLElement): GraphMountHandle {
  ensureGraphStyles();

  const wrapper = document.createElement("div");
  wrapper.style.display = "contents";
  container.appendChild(wrapper);

  let currentHandle: Graph2DHandle | Graph3DHandle | null = null;
  let renderCancel: (() => void) | null = null;

  // 前回の render 引数（再描画スキップ最適化は行わず、毎回実行）
  function clearContent(): void {
    if (currentHandle) {
      currentHandle.destroy();
      currentHandle = null;
    }
    wrapper.innerHTML = "";
  }

  function showLoading(isDark: boolean, fill: boolean): void {
    clearContent();
    const row = document.createElement("div");
    row.className = fill ? "am-graph-loading-row-fill" : "am-graph-loading-row-padded";
    const spinner = createSpinner({ size: 20 });
    row.appendChild(spinner.el);
    const label = document.createElement("span");
    label.style.color = getTextSecondary(isDark);
    label.style.fontSize = "0.875rem";
    label.textContent = "グラフライブラリを読み込み中...";
    row.appendChild(label);
    wrapper.appendChild(row);
  }

  function showError(message: string, isDark: boolean): void {
    clearContent();
    const wrap = document.createElement("div");
    wrap.className = "am-graph-alert-wrap";
    wrap.appendChild(createInlineAlert(message, isDark));
    wrapper.appendChild(wrap);
  }

  function applyState(
    state: GraphRenderState,
    isDark: boolean,
    width: number,
    height: number,
  ): void {
    if (state.loading) {
      showLoading(isDark, false);
      return;
    }

    if (state.error) {
      showError(state.error, isDark);
      return;
    }

    if (!state.graphExpr) {
      clearContent();
      return;
    }

    const is3d =
      state.graphExpr.type === "surface3d" ||
      state.graphExpr.type === "parametric3d";

    if (is3d && state.plotly) {
      clearContent();
      const handle = createGraph3DControls(
        state.graphExpr,
        state.plotly,
        width,
        height,
        isDark,
      );
      currentHandle = handle;
      wrapper.appendChild(handle.el);
      return;
    }

    if (!is3d && state.jsxGraph) {
      clearContent();
      const handle = createGraph2DControls(
        state.graphExpr,
        state.jsxGraph,
        width,
        height,
        isDark,
      );
      currentHandle = handle;
      wrapper.appendChild(handle.el);
      return;
    }

    // ライブラリ未ロード状態: 何も表示しない
    clearContent();
  }

  return {
    render(code: string, enabled: boolean, isDark: boolean): void {
      // 前回の非同期処理をキャンセル
      renderCancel?.();
      renderCancel = null;
      clearContent();

      if (!enabled) return;

      const width = 500;
      const height = 400;

      const handle = parseGraphCode(code, enabled, (state) => {
        applyState(state, isDark, width, height);
      });
      renderCancel = () => handle.cancel();
    },

    destroy(): void {
      renderCancel?.();
      renderCancel = null;
      clearContent();
      wrapper.remove();
    },
  };
}
