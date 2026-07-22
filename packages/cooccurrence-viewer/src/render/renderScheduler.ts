import { drawGraph } from './drawGraph';
import { readCooccurrenceTheme } from '../theme/readTheme';
import type { CooccurrenceTheme } from '../theme/readTheme';
import type { RenderGraph, RenderNode, ThemeMode, ViewportState } from '../types';

export interface RenderFrameState {
  graph: RenderGraph;
  viewport: ViewportState;
  selectedNodeIndex: number | null;
  hoveredNode: RenderNode | null;
  themeMode: ThemeMode;
}

export interface RenderSchedulerOptions {
  canvas: HTMLCanvasElement;
  /** テーマ変数（--cooc-*）が載っている要素。 */
  themeHost: HTMLElement;
  getState(): RenderFrameState;
}

export interface RenderScheduler {
  /** 表示に影響する状態が変わったことを伝える。次のフレームで 1 回だけ描く。 */
  invalidate(): void;
  /** テーマ変数を読み直したうえで再描画する。 */
  invalidateTheme(): void;
  stop(): void;
  /** 観測点。描画した回数（テストが「無操作で増えない」ことを検査できる）。 */
  getFrameCount(): number;
}

function updateCanvasSize(canvas: HTMLCanvasElement): { width: number; height: number } {
  const parent = canvas.parentElement;
  const width = parent?.clientWidth ?? 0;
  const height = parent?.clientHeight ?? 0;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  return { width, height };
}

/**
 * 要求されたときだけ描く描画スケジューラ。
 *
 * Why not `requestAnimationFrame` で常時ループするか: 無操作でも 60fps で回り続け、
 * 1 フレームごとにテーマ変数の `getComputedStyle` を 10 回、canvas バッキングストアの
 * 再確保、ラベルの重なり判定（語数に対して二乗）を実行していた。放置しただけで
 * CPU を使い続ける。VS Code の webview は retainContextWhenHidden のため、タブを
 * 隠しても止まらない。
 *
 * テーマ変数は変化したときだけ読み直す。毎フレーム読むと強制スタイル再計算が入る。
 */
export function createRenderScheduler(options: RenderSchedulerOptions): RenderScheduler {
  const { canvas, themeHost, getState } = options;
  let scheduled = false;
  let stopped = false;
  let rafId = 0;
  let frameCount = 0;
  let theme: CooccurrenceTheme | null = null;
  let themeModeAtRead: ThemeMode | null = null;

  function draw(): void {
    scheduled = false;
    if (stopped) return;
    const state = getState();
    const size = updateCanvasSize(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (theme === null || themeModeAtRead !== state.themeMode) {
      theme = readCooccurrenceTheme(themeHost, state.themeMode);
      themeModeAtRead = state.themeMode;
    }
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawGraph({
      ctx,
      width: size.width,
      height: size.height,
      graph: state.graph,
      viewport: state.viewport,
      theme,
      selectedNodeIndex: state.selectedNodeIndex,
      hoveredNode: state.hoveredNode,
    });
    frameCount += 1;
  }

  function invalidate(): void {
    if (scheduled || stopped) return;
    scheduled = true;
    rafId = requestAnimationFrame(draw);
  }

  return {
    invalidate,
    invalidateTheme(): void {
      theme = null;
      invalidate();
    },
    stop(): void {
      stopped = true;
      cancelAnimationFrame(rafId);
    },
    getFrameCount: () => frameCount,
  };
}
