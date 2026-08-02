/**
 * createZoomPanState のユニットテスト
 */

import { createZoomPanState, ZOOM_BUTTON_STEP, ZOOM_WHEEL_STEP, ZOOM_MIN, ZOOM_MAX } from "../vanilla/zoomPanState";

// jsdom は PointerEvent を未定義のため polyfill する
if (typeof PointerEvent === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).PointerEvent = class PointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  };
}

describe("createZoomPanState", () => {
  it("初期状態は zoom=1, pan=(0,0), isDirty=false", () => {
    const zp = createZoomPanState();
    const s = zp.getState();
    expect(s.zoom).toBe(1);
    expect(s.pan).toEqual({ x: 0, y: 0 });
    expect(s.isDirty).toBe(false);
  });

  it("zoomIn で zoom が増加する", () => {
    const zp = createZoomPanState();
    zp.zoomIn();
    expect(zp.getState().zoom).toBeCloseTo(1 + ZOOM_BUTTON_STEP);
  });

  it("zoomOut で zoom が減少する", () => {
    const zp = createZoomPanState();
    zp.zoomOut();
    expect(zp.getState().zoom).toBeCloseTo(1 - ZOOM_BUTTON_STEP);
  });

  it("zoom は ZOOM_MIN / ZOOM_MAX でクランプされる", () => {
    const zp = createZoomPanState();
    zp.setZoom(0);
    expect(zp.getState().zoom).toBe(ZOOM_MIN);
    zp.setZoom(999);
    expect(zp.getState().zoom).toBe(ZOOM_MAX);
  });

  it("reset で初期状態に戻る", () => {
    const zp = createZoomPanState();
    zp.zoomIn();
    zp.reset();
    const s = zp.getState();
    expect(s.zoom).toBe(1);
    expect(s.pan).toEqual({ x: 0, y: 0 });
    expect(s.isDirty).toBe(false);
  });

  it("subscribe で状態変化を購読できる", () => {
    const zp = createZoomPanState();
    const fn = jest.fn();
    const unsub = zp.subscribe(fn);
    zp.zoomIn();
    expect(fn).toHaveBeenCalledTimes(1);
    unsub();
    zp.zoomIn();
    expect(fn).toHaveBeenCalledTimes(1); // unsub 後は呼ばれない
  });

  it("isDirty は zoom != 1 のとき true になる", () => {
    const zp = createZoomPanState();
    zp.zoomIn();
    expect(zp.getState().isDirty).toBe(true);
  });

  describe("attach", () => {
    it("pointerdown → pointermove でパンが更新される", () => {
      const zp = createZoomPanState();
      const el = document.createElement("div");
      // setPointerCapture をスタブ
      el.setPointerCapture = jest.fn();
      const detach = zp.attach(el);

      el.dispatchEvent(new PointerEvent("pointerdown", { clientX: 10, clientY: 20, bubbles: true }));
      el.dispatchEvent(new PointerEvent("pointermove", { clientX: 30, clientY: 50, buttons: 1, bubbles: true }));

      expect(zp.getState().pan).toEqual({ x: 20, y: 30 });
      detach();
    });

    it("ボタン非押下の stale な pointermove では pending を破棄し capture もパンもしない", () => {
      // el 外での pointerup 取りこぼしで pendingPan が残った後、hover 由来の
      // ボタン非押下 move が来ても誤パン・setPointerCapture 例外を起こさない。
      const zp = createZoomPanState();
      const el = document.createElement("div");
      el.setPointerCapture = jest.fn();
      const detach = zp.attach(el);

      el.dispatchEvent(new PointerEvent("pointerdown", { clientX: 0, clientY: 0, bubbles: true }));
      // 閾値超だが buttons=0（ボタン離れている）→ パンしない。
      el.dispatchEvent(new PointerEvent("pointermove", { clientX: 50, clientY: 50, buttons: 0, bubbles: true }));

      expect(el.setPointerCapture).not.toHaveBeenCalled();
      expect(zp.getState().pan).toEqual({ x: 0, y: 0 });
      detach();
    });

    it("閾値未満の pointerdown→pointerup（クリック）では setPointerCapture もパンもしない", () => {
      // 回帰ガード: pointerdown で即 setPointerCapture すると、内包 SVG ノード上の
      // クリックが capture 先へリダイレクトされ、思考法ダイアグラムのラベル編集
      // （<g> の click ハンドラ）が発火しなくなる。閾値未満のタップでは capture しないこと。
      const zp = createZoomPanState();
      const el = document.createElement("div");
      el.setPointerCapture = jest.fn();
      const detach = zp.attach(el);

      el.dispatchEvent(new PointerEvent("pointerdown", { clientX: 10, clientY: 10, bubbles: true }));
      // 数 px の微小移動（クリック時の手ぶれ相当）は閾値未満でパン扱いしない（ボタンは押下中）。
      el.dispatchEvent(new PointerEvent("pointermove", { clientX: 12, clientY: 11, buttons: 1, bubbles: true }));
      el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));

      expect(el.setPointerCapture).not.toHaveBeenCalled();
      expect(zp.getState().pan).toEqual({ x: 0, y: 0 });
      detach();
    });

    it("閾値超のドラッグで初めてパン開始し setPointerCapture する", () => {
      const zp = createZoomPanState();
      const el = document.createElement("div");
      el.setPointerCapture = jest.fn();
      const detach = zp.attach(el);

      el.dispatchEvent(new PointerEvent("pointerdown", { clientX: 0, clientY: 0, pointerId: 7, bubbles: true }));
      el.dispatchEvent(new PointerEvent("pointermove", { clientX: 30, clientY: 50, buttons: 1, bubbles: true }));

      expect(el.setPointerCapture).toHaveBeenCalledWith(7);
      // pan は pointerdown 起点からの総移動量（閾値越えでジャンプせず追従）。
      expect(zp.getState().pan).toEqual({ x: 30, y: 50 });
      detach();
    });

    it("pointerup でパン終了、pointermove が無視される", () => {
      const zp = createZoomPanState();
      const el = document.createElement("div");
      el.setPointerCapture = jest.fn();
      const detach = zp.attach(el);

      el.dispatchEvent(new PointerEvent("pointerdown", { clientX: 0, clientY: 0, bubbles: true }));
      el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      el.dispatchEvent(new PointerEvent("pointermove", { clientX: 100, clientY: 100, bubbles: true }));

      expect(zp.getState().pan).toEqual({ x: 0, y: 0 });
      detach();
    });

    it("detach 後はイベントが無視される", () => {
      const zp = createZoomPanState();
      const el = document.createElement("div");
      el.setPointerCapture = jest.fn();
      const detach = zp.attach(el);
      detach();

      el.dispatchEvent(new PointerEvent("pointerdown", { clientX: 0, clientY: 0, bubbles: true }));
      el.dispatchEvent(new PointerEvent("pointermove", { clientX: 50, clientY: 50, bubbles: true }));
      expect(zp.getState().pan).toEqual({ x: 0, y: 0 });
    });
  });
});
