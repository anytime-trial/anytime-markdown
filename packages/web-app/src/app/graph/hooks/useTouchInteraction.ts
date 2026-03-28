'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Viewport } from '../types';
import { pan as panViewport, zoom as zoomViewport } from '../engine/viewport';

interface UseTouchInteractionProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  viewport: Viewport;
  dispatch: React.Dispatch<any>;
  velocityRef: React.RefObject<{ vx: number; vy: number }>;
}

interface TouchState {
  type: 'none' | 'pan' | 'pinch';
  lastX: number;
  lastY: number;
  lastDist: number;
  lastCenterX: number;
  lastCenterY: number;
}

export function useTouchInteraction({
  canvasRef, viewport, dispatch, velocityRef,
}: UseTouchInteractionProps) {
  const touchRef = useRef<TouchState>({
    type: 'none', lastX: 0, lastY: 0, lastDist: 0, lastCenterX: 0, lastCenterY: 0,
  });
  const panHistoryRef = useRef<{ x: number; y: number; t: number }[]>([]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const cx = (t1.clientX + t2.clientX) / 2;
      const cy = (t1.clientY + t2.clientY) / 2;
      touchRef.current = { type: 'pinch', lastX: cx, lastY: cy, lastDist: dist, lastCenterX: cx, lastCenterY: cy };
      panHistoryRef.current = [];
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      touchRef.current = { type: 'pan', lastX: t.clientX, lastY: t.clientY, lastDist: 0, lastCenterX: 0, lastCenterY: 0 };
      panHistoryRef.current = [{ x: t.clientX, y: t.clientY, t: performance.now() }];
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    e.preventDefault();
    const state = touchRef.current;

    if (state.type === 'pinch' && e.touches.length === 2) {
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const cx = (t1.clientX + t2.clientX) / 2;
      const cy = (t1.clientY + t2.clientY) / 2;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();

      // パン（2本指の中心移動）
      const dx = cx - state.lastCenterX;
      const dy = cy - state.lastCenterY;
      let newViewport = panViewport(viewport, dx, dy);

      // ズーム（2点間距離の変化）
      if (state.lastDist > 0) {
        const scaleDelta = dist / state.lastDist;
        const sx = cx - rect.left;
        const sy = cy - rect.top;
        // zoomViewportはdeltaベース。距離比からdeltaを逆算
        const delta = -Math.log2(scaleDelta) / 0.001;
        newViewport = zoomViewport(newViewport, sx, sy, delta);
      }

      dispatch({ type: 'SET_VIEWPORT', viewport: newViewport });
      touchRef.current = { ...state, lastDist: dist, lastCenterX: cx, lastCenterY: cy };
    } else if (state.type === 'pan' && e.touches.length === 1) {
      const t = e.touches[0];
      const dx = t.clientX - state.lastX;
      const dy = t.clientY - state.lastY;
      dispatch({ type: 'SET_VIEWPORT', viewport: panViewport(viewport, dx, dy) });
      touchRef.current = { ...state, lastX: t.clientX, lastY: t.clientY };

      const now = performance.now();
      panHistoryRef.current.push({ x: t.clientX, y: t.clientY, t: now });
      if (panHistoryRef.current.length > 3) panHistoryRef.current.shift();
    }
  }, [canvasRef, viewport, dispatch]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    e.preventDefault();
    const state = touchRef.current;

    // 1本指パン終了時 → 慣性
    if (state.type === 'pan') {
      const history = panHistoryRef.current;
      if (history.length >= 2) {
        const first = history[0];
        const last = history.at(-1)!;
        const dt = last.t - first.t;
        if (dt > 0 && dt < 100) {
          velocityRef.current.vx = (last.x - first.x) / dt * 16;
          velocityRef.current.vy = (last.y - first.y) / dt * 16;
        }
      }
    }

    panHistoryRef.current = [];

    // 残りの指があればモード切替
    if (e.touches.length === 1) {
      const t = e.touches[0];
      touchRef.current = { type: 'pan', lastX: t.clientX, lastY: t.clientY, lastDist: 0, lastCenterX: 0, lastCenterY: 0 };
    } else {
      touchRef.current = { type: 'none', lastX: 0, lastY: 0, lastDist: 0, lastCenterX: 0, lastCenterY: 0 };
    }
  }, [velocityRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const opts: AddEventListenerOptions = { passive: false };
    canvas.addEventListener('touchstart', handleTouchStart, opts);
    canvas.addEventListener('touchmove', handleTouchMove, opts);
    canvas.addEventListener('touchend', handleTouchEnd, opts);
    canvas.addEventListener('touchcancel', handleTouchEnd, opts);
    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [canvasRef, handleTouchStart, handleTouchMove, handleTouchEnd]);
}
