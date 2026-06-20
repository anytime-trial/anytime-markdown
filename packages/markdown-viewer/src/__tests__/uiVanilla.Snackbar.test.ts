/**
 * ui-vanilla/Snackbar.ts（素 DOM ファクトリ）の jsdom ユニットテスト。
 *
 * 検証観点（contract §6）:
 * 1. DOM 生成（tagName / data 属性 / cssText に var(--am-...) を含む / --snackbar-duration）
 * 2. anchorOrigin の配置（justify-content / top|bottom / 初期 transform）
 * 3. Portal ライフサイクル（setOpen(true) で body へ append → rAF で visible、close で取り外し）
 * 4. autoHideDuration タイマー（経過で onClose を 1 度発火 / null なら非発火 / close で停止）
 * 5. update（anchorOrigin / onClose / autoHideDuration / children の差し替え）
 * 6. destroy のクリーンアップ（autoHide タイマー停止・transitionMount dispose・el 取り外し）
 *
 * jsdom は継承された CSS カスタムプロパティを getComputedStyle で解決しないため、
 * inherit の computed 検証は行わず el.style.cssText が var(--am-...) を含むことを検証する。
 * rAF は手動 flush できるよう spy で捕捉し、setTimeout は jest fake timers で進める。
 */

import { createSnackbar } from "@anytime-markdown/ui-core/Snackbar";

/** 捕捉した rAF コールバック（手動 flush 用）。 */
let rafCallbacks: FrameRequestCallback[] = [];
let rafSpy: jest.SpyInstance;
let cancelSpy: jest.SpyInstance;

/** 捕捉済みの rAF を全て実行する（次フレーム相当）。 */
function flushRaf(): void {
  const pending = rafCallbacks;
  rafCallbacks = [];
  for (const cb of pending) cb(0);
}

/** documentElement に --am-* を注入する（applyEditorThemeCssVars 相当の最小版）。 */
function injectThemeVars(): void {
  const root = document.documentElement;
  root.style.setProperty("--am-color-text-primary", "rgba(0,0,0,0.87)");
  root.style.setProperty("--am-ease-standard", "cubic-bezier(0.4,0,0.2,1)");
}

beforeEach(() => {
  document.body.innerHTML = "";
  injectThemeVars();
  jest.useFakeTimers();
  rafCallbacks = [];
  let nextId = 1;
  const idToIndex = new Map<number, number>();
  rafSpy = jest.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
    const id = nextId++;
    idToIndex.set(id, rafCallbacks.length);
    rafCallbacks.push(cb);
    return id;
  });
  cancelSpy = jest.spyOn(globalThis, "cancelAnimationFrame").mockImplementation((id) => {
    const idx = idToIndex.get(id);
    if (idx !== undefined) rafCallbacks[idx] = () => {};
  });
});

afterEach(() => {
  rafSpy.mockRestore();
  cancelSpy.mockRestore();
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe("createSnackbar", () => {
  it("root div を生成し data 属性・fixed 配置・var(--am-...) を持つ", () => {
    const { el, destroy } = createSnackbar();
    expect(el.tagName).toBe("DIV");
    expect(el.hasAttribute("data-am-snackbar")).toBe(true);
    expect(el.style.position).toBe("fixed");
    // jsdom は継承 CSS 変数を解決しないため cssText に var(--am-...) を含むことのみ検証。
    expect(el.style.cssText).toContain("var(--am-ease-standard");
    expect(el.style.zIndex).toBe("1400");
    destroy();
  });

  it("timeout を --snackbar-duration に反映する", () => {
    const { el, destroy } = createSnackbar({ timeout: 400 });
    expect(el.style.getPropertyValue("--snackbar-duration")).toBe("400ms");
    destroy();
  });

  it("既定 anchorOrigin は bottom/center（justify-content:center / translateY(16px)）", () => {
    const { el, destroy } = createSnackbar();
    expect(el.style.justifyContent).toBe("center");
    expect(el.style.bottom).toBe("24px");
    expect(el.style.transform).toBe("translateY(16px)");
    destroy();
  });

  it("anchorOrigin top/right を justify-content:flex-end / top:24px / translateY(-16px) に反映する", () => {
    const { el, destroy } = createSnackbar({
      anchorOrigin: { vertical: "top", horizontal: "right" },
    });
    expect(el.style.justifyContent).toBe("flex-end");
    expect(el.style.top).toBe("24px");
    expect(el.style.transform).toBe("translateY(-16px)");
    destroy();
  });

  it("anchorOrigin left を justify-content:flex-start に反映する", () => {
    const { el, destroy } = createSnackbar({
      anchorOrigin: { vertical: "bottom", horizontal: "left" },
    });
    expect(el.style.justifyContent).toBe("flex-start");
    destroy();
  });

  it("生成直後（open 未指定）は body へ append されない", () => {
    const { el, destroy } = createSnackbar();
    expect(document.body.contains(el)).toBe(false);
    destroy();
  });

  it("setOpen(true) で body へ append（mounted）→ rAF flush で visible（opacity:1）", () => {
    const { el, setOpen, destroy } = createSnackbar({ timeout: 200 });
    setOpen(true);
    expect(document.body.contains(el)).toBe(true);
    expect(el.style.opacity).toBe("0");

    flushRaf();
    expect(el.style.opacity).toBe("1");
    expect(el.style.transform).toBe("translateY(0)");
    destroy();
  });

  it("setOpen(false) で opacity 0 へ戻し、timeout 経過後に body から取り外す", () => {
    const { el, setOpen, destroy } = createSnackbar({ timeout: 200 });
    setOpen(true);
    flushRaf();
    expect(document.body.contains(el)).toBe(true);

    setOpen(false);
    expect(el.style.opacity).toBe("0");
    expect(el.style.transform).toBe("translateY(16px)");

    jest.advanceTimersByTime(199);
    expect(document.body.contains(el)).toBe(true);
    jest.advanceTimersByTime(1);
    expect(document.body.contains(el)).toBe(false);
    destroy();
  });

  it("初期 open=true は body へ即 append し visible 状態にする", () => {
    const { el, destroy } = createSnackbar({ open: true });
    expect(document.body.contains(el)).toBe(true);
    expect(el.style.opacity).toBe("1");
    expect(el.style.transform).toBe("translateY(0)");
    destroy();
  });

  it("children（string / Node / 配列）を流し込む", () => {
    const node = document.createElement("span");
    node.id = "alert-node";
    const { el, destroy } = createSnackbar({ children: ["text", node] });
    expect(el.textContent).toContain("text");
    expect(el.querySelector("#alert-node")).toBe(node);
    destroy();
  });

  it("autoHideDuration 経過で onClose を 1 度発火する", () => {
    const onClose = jest.fn();
    const { setOpen, destroy } = createSnackbar({ autoHideDuration: 3000, onClose });
    setOpen(true);
    expect(onClose).not.toHaveBeenCalled();

    jest.advanceTimersByTime(2999);
    expect(onClose).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    destroy();
  });

  it("初期 open=true + autoHideDuration でも経過後 onClose を発火する", () => {
    const onClose = jest.fn();
    const { destroy } = createSnackbar({ open: true, autoHideDuration: 1000, onClose });
    jest.advanceTimersByTime(1000);
    expect(onClose).toHaveBeenCalledTimes(1);
    destroy();
  });

  it("autoHideDuration null では onClose を発火しない", () => {
    const onClose = jest.fn();
    const { setOpen, destroy } = createSnackbar({ autoHideDuration: null, onClose });
    setOpen(true);
    jest.advanceTimersByTime(100000);
    expect(onClose).not.toHaveBeenCalled();
    destroy();
  });

  it("setOpen(false) で autoHide タイマーを停止する", () => {
    const onClose = jest.fn();
    const { setOpen, destroy } = createSnackbar({ autoHideDuration: 3000, onClose });
    setOpen(true);
    jest.advanceTimersByTime(1000);
    setOpen(false);
    jest.advanceTimersByTime(5000);
    expect(onClose).not.toHaveBeenCalled();
    destroy();
  });

  it("update で anchorOrigin を差し替え配置を更新する", () => {
    const { el, update, destroy } = createSnackbar();
    update({ anchorOrigin: { vertical: "top", horizontal: "left" } });
    expect(el.style.top).toBe("24px");
    expect(el.style.justifyContent).toBe("flex-start");
    expect(el.style.transform).toBe("translateY(-16px)");
    destroy();
  });

  it("update で children を差し替える", () => {
    const { el, update, destroy } = createSnackbar({ children: "old" });
    expect(el.textContent).toContain("old");
    const fresh = document.createElement("b");
    fresh.id = "new-node";
    update({ children: fresh });
    expect(el.textContent).not.toContain("old");
    expect(el.querySelector("#new-node")).toBe(fresh);
    destroy();
  });

  it("update で onClose を差し替え、新しい onClose が発火する", () => {
    const first = jest.fn();
    const second = jest.fn();
    const { setOpen, update, destroy } = createSnackbar({ autoHideDuration: 2000, onClose: first });
    update({ onClose: second });
    setOpen(true);
    jest.advanceTimersByTime(2000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    destroy();
  });

  it("open 中の update(autoHideDuration) で新しい duration へ再スケジュールする", () => {
    const onClose = jest.fn();
    const { setOpen, update, destroy } = createSnackbar({ autoHideDuration: 5000, onClose });
    setOpen(true);
    update({ autoHideDuration: 1000 });
    jest.advanceTimersByTime(1000);
    expect(onClose).toHaveBeenCalledTimes(1);
    destroy();
  });

  it("destroy で autoHide タイマーを停止し el を取り外す", () => {
    const onClose = jest.fn();
    const { el, setOpen, destroy } = createSnackbar({ autoHideDuration: 3000, onClose });
    setOpen(true);
    flushRaf();
    expect(document.body.contains(el)).toBe(true);

    destroy();
    expect(document.body.contains(el)).toBe(false);
    jest.advanceTimersByTime(10000);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("destroy で進行中 transitionMount の unmount タイマーも止まる", () => {
    const { el, setOpen, destroy } = createSnackbar({ timeout: 200 });
    setOpen(true);
    flushRaf();
    setOpen(false); // unmount タイマー開始
    destroy();
    // destroy が el を即取り外すため、タイマー進行後も追加の副作用なし
    jest.advanceTimersByTime(1000);
    expect(document.body.contains(el)).toBe(false);
  });
});
