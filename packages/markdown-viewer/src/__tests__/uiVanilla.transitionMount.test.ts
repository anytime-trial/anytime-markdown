/**
 * ui-vanilla/transitionMount.ts（脱React の callback ベース素関数）の jsdom ユニットテスト。
 *
 * 検証観点:
 * 1. 初期状態（open 初期値が mounted / visible に反映され、生成時は callback 非発火）
 * 2. open=true ライフサイクル（mounted=true 同期 → rAF で visible=true）
 * 3. close ライフサイクル（visible=false 同期 → timeout 後 mounted=false）
 * 4. unmountOnExit=false（close で mounted は維持）
 * 5. callback の冪等性（状態が変化したときのみ発火）
 * 6. dispose / 再 setOpen による進行中タイマー（rAF / setTimeout）のクリーンアップ
 *
 * rAF は手動 flush できるよう spy で捕捉し、setTimeout は jest fake timers で進める。
 */

import { createTransitionMount } from "@anytime-markdown/graph-core/ui-vanilla/transitionMount";

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

beforeEach(() => {
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

describe("createTransitionMount", () => {
  it("初期状態は open=false で mounted/visible とも false、callback 非発火", () => {
    const onMounted = jest.fn();
    const onVisible = jest.fn();
    const t = createTransitionMount({
      timeout: 200,
      onMountedChange: onMounted,
      onVisibleChange: onVisible,
    });
    expect(t.getState()).toEqual({ mounted: false, visible: false });
    expect(onMounted).not.toHaveBeenCalled();
    expect(onVisible).not.toHaveBeenCalled();
    t.dispose();
  });

  it("初期 open=true で mounted/visible とも true（副作用なし）", () => {
    const onMounted = jest.fn();
    const t = createTransitionMount({ open: true, timeout: 200, onMountedChange: onMounted });
    expect(t.getState()).toEqual({ mounted: true, visible: true });
    // 初期値の反映であり onMountedChange は発火しない
    expect(onMounted).not.toHaveBeenCalled();
    t.dispose();
  });

  it("setOpen(true) で mounted=true を同期反映し、rAF flush 後に visible=true", () => {
    const onMounted = jest.fn();
    const onVisible = jest.fn();
    const t = createTransitionMount({
      timeout: 200,
      onMountedChange: onMounted,
      onVisibleChange: onVisible,
    });

    t.setOpen(true);
    expect(t.getState()).toEqual({ mounted: true, visible: false });
    expect(onMounted).toHaveBeenCalledWith(true);
    expect(onVisible).not.toHaveBeenCalled();
    expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1);

    flushRaf();
    expect(t.getState()).toEqual({ mounted: true, visible: true });
    expect(onVisible).toHaveBeenCalledWith(true);
    t.dispose();
  });

  it("setOpen(false) で visible=false を同期反映し、timeout 経過後に mounted=false", () => {
    const onMounted = jest.fn();
    const onVisible = jest.fn();
    const t = createTransitionMount({
      open: true,
      timeout: 200,
      onMountedChange: onMounted,
      onVisibleChange: onVisible,
    });

    t.setOpen(false);
    expect(t.getState()).toEqual({ mounted: true, visible: false });
    expect(onVisible).toHaveBeenCalledWith(false);
    expect(onMounted).not.toHaveBeenCalled();

    // timeout 未満では mounted は維持
    jest.advanceTimersByTime(199);
    expect(t.getState().mounted).toBe(true);

    jest.advanceTimersByTime(1);
    expect(t.getState()).toEqual({ mounted: false, visible: false });
    expect(onMounted).toHaveBeenCalledWith(false);
    t.dispose();
  });

  it("unmountOnExit=false では close しても mounted を維持する", () => {
    const onMounted = jest.fn();
    const t = createTransitionMount({
      open: true,
      timeout: 200,
      unmountOnExit: false,
      onMountedChange: onMounted,
    });

    t.setOpen(false);
    jest.advanceTimersByTime(1000);
    expect(t.getState()).toEqual({ mounted: true, visible: false });
    expect(onMounted).not.toHaveBeenCalled();
    t.dispose();
  });

  it("同じ状態への遷移では callback を重複発火しない（冪等）", () => {
    const onVisible = jest.fn();
    const t = createTransitionMount({ timeout: 200, onVisibleChange: onVisible });

    t.setOpen(true);
    flushRaf();
    expect(onVisible).toHaveBeenCalledTimes(1);

    // 既に visible=true の状態で再度 open → rAF で setVisible(true) は no-op
    t.setOpen(true);
    flushRaf();
    expect(onVisible).toHaveBeenCalledTimes(1);
    t.dispose();
  });

  it("close → 即 open で進行中 unmount タイマーを破棄し mounted を維持する", () => {
    const onMounted = jest.fn();
    const t = createTransitionMount({ open: true, timeout: 200, onMountedChange: onMounted });

    t.setOpen(false); // unmount タイマー開始
    t.setOpen(true); // タイマーを cancel して再 open
    jest.advanceTimersByTime(1000);
    flushRaf();

    expect(t.getState()).toEqual({ mounted: true, visible: true });
    // mounted は true のまま一度も false にならない
    expect(onMounted).not.toHaveBeenCalledWith(false);
    t.dispose();
  });

  it("open 中に close すると進行中 rAF を cancel し visible が true にならない", () => {
    const onVisible = jest.fn();
    const t = createTransitionMount({ timeout: 200, onVisibleChange: onVisible });

    t.setOpen(true); // rAF 予約（未 flush）
    expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1);
    t.setOpen(false); // cancelAnimationFrame されるはず
    expect(globalThis.cancelAnimationFrame).toHaveBeenCalled();

    flushRaf(); // cancel 済みなので no-op
    expect(t.getState().visible).toBe(false);
    expect(onVisible).not.toHaveBeenCalledWith(true);
    t.dispose();
  });

  it("dispose で進行中の rAF / setTimeout を解除する", () => {
    const onMounted = jest.fn();
    const onVisible = jest.fn();
    const t = createTransitionMount({
      timeout: 200,
      onMountedChange: onMounted,
      onVisibleChange: onVisible,
    });

    t.setOpen(true); // rAF 予約
    t.dispose();
    expect(globalThis.cancelAnimationFrame).toHaveBeenCalled();
    flushRaf();
    expect(onVisible).not.toHaveBeenCalled();

    // close 中の unmount タイマーも dispose で止まる
    const t2 = createTransitionMount({ open: true, timeout: 200, onMountedChange: jest.fn() });
    t2.setOpen(false);
    t2.dispose();
    jest.advanceTimersByTime(1000);
    expect(t2.getState().mounted).toBe(true);
  });
});
