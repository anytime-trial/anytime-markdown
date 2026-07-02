/**
 * ZoomPan 状態の vanilla 版 — useZoomPan の React 非依存移植。
 * native PointerEvent で pan/zoom を管理し、closure state で状態保持。
 */

export const ZOOM_BUTTON_STEP = 0.1;
export const ZOOM_WHEEL_STEP = 0.05;
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 5;
/**
 * パン開始とみなすドラッグ距離のしきい値（px）。
 * これ未満の移動はクリック（タップ）として扱い、pointerdown 直後には
 * setPointerCapture しない。即時 capture すると内包 SVG ノード上のクリックが
 * capture 先へリダイレクトされ、思考法ダイアグラムのラベル編集（<g> の click
 * ハンドラ）が発火しなくなる回帰を招くため。
 */
export const PAN_START_THRESHOLD_PX = 4;

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
      // pointerdown 時点では pending（パン候補）とし、閾値超のドラッグで初めて
      // isPanning=true にして setPointerCapture する。こうすることで純粋クリックは
      // capture されず内包ノードへ届き、ドラッグ時のみパンできる。
      let pendingPan = false;
      let capturePointerId = 0;
      const onPointerDown = (e: PointerEvent): void => {
        pendingPan = true;
        isPanning = false;
        capturePointerId = e.pointerId;
        panStart = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      };
      const onPointerMove = (e: PointerEvent): void => {
        if (!pendingPan) return;
        // 閾値超えまで setPointerCapture しないため、el 外での pointerup を取りこぼすと
        // pendingPan が残る。ボタン非押下の stale な move では pending を解除する
        // （ボタン非押下時の setPointerCapture は実ブラウザで例外になり得るため未然に防ぐ）。
        if (e.buttons === 0) {
          pendingPan = false;
          isPanning = false;
          return;
        }
        const dx = e.clientX - panStart.x;
        const dy = e.clientY - panStart.y;
        if (!isPanning) {
          if (Math.hypot(dx, dy) < PAN_START_THRESHOLD_PX) return; // 閾値未満はクリック扱い
          isPanning = true;
          el.setPointerCapture(capturePointerId);
        }
        pan = { x: panStart.panX + dx, y: panStart.panY + dy };
        notify();
      };
      const onPointerUp = (): void => { pendingPan = false; isPanning = false; };
      const onPointerCancel = (): void => { pendingPan = false; isPanning = false; };
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
