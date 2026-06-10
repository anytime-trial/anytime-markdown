/**
 * ZoomPan 状態の vanilla 版 — useZoomPan の React 非依存移植。
 * native PointerEvent で pan/zoom を管理し、closure state で状態保持。
 */

export const ZOOM_BUTTON_STEP = 0.1;
export const ZOOM_WHEEL_STEP = 0.05;
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 5;

export interface ZoomPanState {
  zoom: number;
  pan: { x: number; y: number };
  isDirty: boolean;
}

export interface ZoomPanController {
  /** 現在の状態を取得 */
  getState: () => ZoomPanState;
  /** ズームイン */
  zoomIn: () => void;
  /** ズームアウト */
  zoomOut: () => void;
  /** ズームを直接指定 */
  setZoom: (v: number) => void;
  /** 状態をリセット（zoom=1, pan=0,0） */
  reset: () => void;
  /** PointerEvent をアタッチした element に bind する */
  attach: (el: HTMLElement) => () => void;
  /** 状態変化を購読する（戻り値: 購読解除関数） */
  subscribe: (fn: (state: ZoomPanState) => void) => () => void;
}

/** vanilla ZoomPan 状態ファクトリ */
export function createZoomPanState(): ZoomPanController {
  let zoom = 1;
  let pan = { x: 0, y: 0 };
  const subscribers = new Set<(state: ZoomPanState) => void>();

  let isPanning = false;
  let panStart = { x: 0, y: 0, panX: 0, panY: 0 };

  function getState(): ZoomPanState {
    return { zoom, pan, isDirty: zoom !== 1 || pan.x !== 0 || pan.y !== 0 };
  }

  function notify(): void {
    const s = getState();
    for (const fn of subscribers) fn(s);
  }

  function setZoomClamped(v: number): void {
    zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v));
    notify();
  }

  const controller: ZoomPanController = {
    getState,
    setZoom(v) { setZoomClamped(v); },
    zoomIn() { setZoomClamped(zoom + ZOOM_BUTTON_STEP); },
    zoomOut() { setZoomClamped(zoom - ZOOM_BUTTON_STEP); },
    reset() {
      zoom = 1;
      pan = { x: 0, y: 0 };
      notify();
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => { subscribers.delete(fn); };
    },
    attach(el) {
      const onPointerDown = (e: PointerEvent): void => {
        isPanning = true;
        panStart = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
        el.setPointerCapture(e.pointerId);
      };
      const onPointerMove = (e: PointerEvent): void => {
        if (!isPanning) return;
        pan = {
          x: panStart.panX + (e.clientX - panStart.x),
          y: panStart.panY + (e.clientY - panStart.y),
        };
        notify();
      };
      const onPointerUp = (): void => { isPanning = false; };
      const onPointerCancel = (): void => { isPanning = false; };
      const onWheel = (e: WheelEvent): void => {
        if (!e.shiftKey) return;
        e.preventDefault();
        setZoomClamped(zoom + (e.deltaY < 0 ? ZOOM_WHEEL_STEP : -ZOOM_WHEEL_STEP));
      };

      el.addEventListener("pointerdown", onPointerDown);
      el.addEventListener("pointermove", onPointerMove);
      el.addEventListener("pointerup", onPointerUp);
      el.addEventListener("pointercancel", onPointerCancel);
      el.addEventListener("wheel", onWheel, { passive: false });

      return () => {
        el.removeEventListener("pointerdown", onPointerDown);
        el.removeEventListener("pointermove", onPointerMove);
        el.removeEventListener("pointerup", onPointerUp);
        el.removeEventListener("pointercancel", onPointerCancel);
        el.removeEventListener("wheel", onWheel);
      };
    },
  };

  return controller;
}
