/**
 * ui-vanilla/mediaQuery.ts（素 DOM matchMedia ラッパ）の jsdom ユニットテスト。
 *
 * 検証観点:
 * 1. 生成（matches の同期取得 / onChange の即時通知）
 * 2. subscribe による change 通知（mql.dispatchEvent("change") 発火）
 * 3. unsubscribe による個別解除
 * 4. destroy のクリーンアップ（内部 change listener 解除・全 listener clear）
 * 5. 非ブラウザ環境（matchMedia 不在）での false フォールバックと no-op
 *
 * jsdom は matchMedia を実装しないため、本テストでは change を発火できる FakeMediaQueryList を
 * window.matchMedia に差し込んで制御する。
 */

import { createMediaQuery } from "@anytime-markdown/graph-core/ui-vanilla/mediaQuery";

/** change を任意発火できる最小 MediaQueryList フェイク。 */
class FakeMediaQueryList {
  matches: boolean;
  readonly media: string;
  private readonly changeListeners = new Set<() => void>();

  constructor(media: string, matches: boolean) {
    this.media = media;
    this.matches = matches;
  }

  addEventListener(type: string, listener: () => void): void {
    if (type === "change") this.changeListeners.add(listener);
  }

  removeEventListener(type: string, listener: () => void): void {
    if (type === "change") this.changeListeners.delete(listener);
  }

  /** matches を更新し、登録済み change listener を発火する。 */
  setMatches(next: boolean): void {
    this.matches = next;
    for (const listener of this.changeListeners) listener();
  }

  /** テスト用: 現在 addEventListener 済みの change listener 数。 */
  get listenerCount(): number {
    return this.changeListeners.size;
  }
}

const realMatchMedia = window.matchMedia;
let activeMql: FakeMediaQueryList;

beforeEach(() => {
  activeMql = new FakeMediaQueryList("(max-width:599.95px)", false);
  // window.matchMedia を制御可能なフェイクへ差し替える。
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: jest.fn((query: string) => {
      activeMql = activeMql.media === query ? activeMql : new FakeMediaQueryList(query, false);
      return activeMql as unknown as MediaQueryList;
    }),
  });
});

afterEach(() => {
  if (realMatchMedia) {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: realMatchMedia,
    });
  } else {
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
  }
});

describe("createMediaQuery", () => {
  it("生成直後の matches を matchMedia の結果から同期取得する", () => {
    activeMql.matches = true;
    const handle = createMediaQuery("(max-width:599.95px)");
    expect(handle.matches).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith("(max-width:599.95px)");
    handle.destroy();
  });

  it("onChange を渡すと生成直後に current の matches を即座に通知する", () => {
    activeMql.matches = true;
    const onChange = jest.fn();
    const handle = createMediaQuery("(max-width:599.95px)", { onChange });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
    handle.destroy();
  });

  it("subscribe した listener へ change を通知する", () => {
    const handle = createMediaQuery("(max-width:599.95px)");
    const listener = jest.fn();
    handle.subscribe(listener);

    activeMql.setMatches(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(true);
    expect(handle.matches).toBe(true);

    activeMql.setMatches(false);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(false);
    handle.destroy();
  });

  it("複数 listener へ多重配信し、内部 change listener は 1 つだけ登録する", () => {
    const handle = createMediaQuery("(max-width:599.95px)");
    const a = jest.fn();
    const b = jest.fn();
    handle.subscribe(a);
    handle.subscribe(b);

    // mql への addEventListener はファクトリ内で 1 回のみ（多重登録しない）。
    expect(activeMql.listenerCount).toBe(1);

    activeMql.setMatches(true);
    expect(a).toHaveBeenCalledWith(true);
    expect(b).toHaveBeenCalledWith(true);
    handle.destroy();
  });

  it("subscribe の返り値で個別 unsubscribe できる", () => {
    const handle = createMediaQuery("(max-width:599.95px)");
    const listener = jest.fn();
    const unsubscribe = handle.subscribe(listener);

    unsubscribe();
    activeMql.setMatches(true);
    expect(listener).not.toHaveBeenCalled();
    handle.destroy();
  });

  it("destroy で内部 change listener を解除し、以後の change で通知しない", () => {
    const handle = createMediaQuery("(max-width:599.95px)");
    const listener = jest.fn();
    handle.subscribe(listener);
    expect(activeMql.listenerCount).toBe(1);

    handle.destroy();
    expect(activeMql.listenerCount).toBe(0);

    activeMql.setMatches(true);
    expect(listener).not.toHaveBeenCalled();
  });

  it("非ブラウザ環境（matchMedia 不在）では false を返し subscribe/destroy が no-op", () => {
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;

    const onChange = jest.fn();
    const handle = createMediaQuery("(max-width:599.95px)", { onChange });
    expect(handle.matches).toBe(false);
    expect(onChange).toHaveBeenCalledWith(false);

    const listener = jest.fn();
    const unsubscribe = handle.subscribe(listener);
    // 購読・解除・破棄が例外を投げないこと（no-op）。
    expect(() => unsubscribe()).not.toThrow();
    expect(() => handle.destroy()).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });
});
