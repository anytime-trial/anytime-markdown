/**
 * useTouchInteraction 相当の vanilla factory。
 *
 * React 依存なし。canvas に touchstart / touchmove / touchend / touchcancel リスナを
 * 自前登録し、closure 変数でタッチ状態を管理する。
 * createCanvasInteraction と同じ deps 規約（getter 経由で最新 viewport を取得）。
 */

import { pan as panViewport, zoom as zoomViewport } from '@anytime-markdown/graph-core/engine';
import type { Viewport } from '../types';
import type { Action } from './createGraphStore';

// ── 型 ──

interface TouchState {
  type: 'none' | 'pan' | 'pinch';
  lastX: number;
  lastY: number;
  lastDist: number;
  lastCenterX: number;
  lastCenterY: number;
}

export interface TouchInteractionDeps {
  /** 操作対象の canvas 要素 */
  canvas: HTMLCanvasElement;
  /** 毎イベントで最新 viewport を取得する getter */
  getViewport(): Viewport;
  /** store.dispatch に相当 */
  dispatch(action: Action): void;
  /** 慣性速度を書き込む mutable ref（createCanvasInteraction の velocity と共有） */
  velocityRef: { vx: number; vy: number };
}

export interface TouchInteractionHandle {
  /** イベントリスナーをすべて解除する */
  destroy(): void;
}

/**
 * canvas へ touch リスナを登録し、パン・ピンチズームを処理する。
 *
 * @returns `{ destroy() }` — 呼び出し側はアンマウント時に必ず destroy() を呼ぶこと。
 */
export function createTouchInteraction(deps: Readonly<TouchInteractionDeps>): TouchInteractionHandle {
  const { canvas, dispatch, velocityRef } = deps;

  // ── closure 変数 ──
  let touchState: TouchState = {
    type: 'none', lastX: 0, lastY: 0, lastDist: 0, lastCenterX: 0, lastCenterY: 0,
  };
  let panHistory: { x: number; y: number; t: number }[] = [];

  // ── ハンドラ ──

  function handleTouchStart(e: TouchEvent): void {
    e.preventDefault();
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const cx = (t1.clientX + t2.clientX) / 2;
      const cy = (t1.clientY + t2.clientY) / 2;
      touchState = { type: 'pinch', lastX: cx, lastY: cy, lastDist: dist, lastCenterX: cx, lastCenterY: cy };
      panHistory = [];
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      touchState = { type: 'pan', lastX: t.clientX, lastY: t.clientY, lastDist: 0, lastCenterX: 0, lastCenterY: 0 };
      panHistory = [{ x: t.clientX, y: t.clientY, t: performance.now() }];
    }
  }

  function handleTouchMove(e: TouchEvent): void {
    e.preventDefault();
    const state = touchState;

    if (state.type === 'pinch' && e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const cx = (t1.clientX + t2.clientX) / 2;
      const cy = (t1.clientY + t2.clientY) / 2;
      const canvas_ = canvas;
      const rect = canvas_.getBoundingClientRect();

      // パン（2本指の中心移動）
      const dx = cx - state.lastCenterX;
      const dy = cy - state.lastCenterY;
      let newViewport = panViewport(deps.getViewport(), dx, dy);

      // ズーム（2点間距離の変化）
      if (state.lastDist > 0) {
        const scaleDelta = dist / state.lastDist;
        const sx = cx - rect.left;
        const sy = cy - rect.top;
        // zoomViewport は delta ベース。距離比から delta を逆算
        const delta = -Math.log2(scaleDelta) / 0.001;
        newViewport = zoomViewport(newViewport, sx, sy, delta);
      }

      dispatch({ type: 'SET_VIEWPORT', viewport: newViewport });
      touchState = { ...state, lastDist: dist, lastCenterX: cx, lastCenterY: cy };
    } else if (state.type === 'pan' && e.touches.length === 1) {
      const t = e.touches[0];
      const dx = t.clientX - state.lastX;
      const dy = t.clientY - state.lastY;
      dispatch({ type: 'SET_VIEWPORT', viewport: panViewport(deps.getViewport(), dx, dy) });
      touchState = { ...state, lastX: t.clientX, lastY: t.clientY };

      const now = performance.now();
      panHistory.push({ x: t.clientX, y: t.clientY, t: now });
      if (panHistory.length > 3) panHistory.shift();
    }
  }

  function handleTouchEnd(e: TouchEvent): void {
    e.preventDefault();
    const state = touchState;

    // 1本指パン終了時 → 慣性速度を書き込む
    if (state.type === 'pan') {
      const history = panHistory;
      if (history.length >= 2) {
        const first = history[0];
        const last = history.at(-1);
        if (first && last) {
          const dt = last.t - first.t;
          if (dt > 0 && dt < 100) {
            velocityRef.vx = (last.x - first.x) / dt * 16;
            velocityRef.vy = (last.y - first.y) / dt * 16;
          }
        }
      }
    }

    panHistory = [];

    // 残りの指があればモード切替
    if (e.touches.length === 1) {
      const t = e.touches[0];
      touchState = { type: 'pan', lastX: t.clientX, lastY: t.clientY, lastDist: 0, lastCenterX: 0, lastCenterY: 0 };
    } else {
      touchState = { type: 'none', lastX: 0, lastY: 0, lastDist: 0, lastCenterX: 0, lastCenterY: 0 };
    }
  }

  // ── リスナ登録（passive: false でスクロール防止） ──

  const opts: AddEventListenerOptions = { passive: false };
  canvas.addEventListener('touchstart', handleTouchStart, opts);
  canvas.addEventListener('touchmove', handleTouchMove, opts);
  canvas.addEventListener('touchend', handleTouchEnd, opts);
  canvas.addEventListener('touchcancel', handleTouchEnd, opts);

  // ── destroy ──

  function destroy(): void {
    canvas.removeEventListener('touchstart', handleTouchStart);
    canvas.removeEventListener('touchmove', handleTouchMove);
    canvas.removeEventListener('touchend', handleTouchEnd);
    canvas.removeEventListener('touchcancel', handleTouchEnd);
  }

  return { destroy };
}
