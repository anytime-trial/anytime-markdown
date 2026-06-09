/**
 * ui-vanilla/Collapse.ts（素 DOM ファクトリ）の jsdom ユニットテスト。
 *
 * 検証観点（contract §6）:
 * 1. DOM 生成（tagName / attribute / cssText・2 層 root>inner 構造）
 * 2. CSS 変数応答（--collapse-duration / cssText が var(--am-...) を含む）
 * 3. 開閉ライフサイクル（grid-template-rows の 0fr↔1fr 切り替え）
 * 4. unmountOnExit（収縮完了後に inner を取り外す / 再 open で復帰）
 * 5. update（className / timeout / children / in の差し替え）
 * 6. destroy のクリーンアップ（進行中タイマー rAF / setTimeout の解除）
 *
 * createTransitionMount が rAF + setTimeout を使うため、rAF は spy で捕捉して手動 flush し、
 * setTimeout は jest fake timers で進める（uiVanilla.transitionMount.test.ts と同方式）。
 *
 * jsdom は継承された CSS カスタムプロパティを getComputedStyle で解決しないため、
 * テーマ変数の検証は cssText が var(--am-...) を含むことで行う（computed の inherit 検証は禁止）。
 */

import { createCollapse } from "../ui-vanilla/Collapse";

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
  document.body.innerHTML = "";
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

describe("createCollapse", () => {
  it("root>inner の 2 層 div を生成し data 属性を付与する", () => {
    const { el, inner, destroy } = createCollapse();
    expect(el.tagName).toBe("DIV");
    expect(inner.tagName).toBe("DIV");
    expect(el.hasAttribute("data-am-collapse")).toBe(true);
    expect(inner.hasAttribute("data-am-collapse-inner")).toBe(true);
    // 既定 in=false / unmountOnExit=false では inner は root 配下に存在する。
    expect(inner.parentNode).toBe(el);
    destroy();
  });

  it("root は grid レイアウトで、cssText に var(--am-ease-standard) を含む", () => {
    const { el, destroy } = createCollapse();
    expect(el.style.display).toBe("grid");
    // jsdom は継承カスタムプロパティを解決しないため、var(--am-...) の存在で検証する。
    expect(el.style.cssText).toContain("var(--am-ease-standard");
    destroy();
  });

  it("inner は overflow:hidden + min-height:0（0fr 時に潰れるため）", () => {
    const { inner, destroy } = createCollapse();
    expect(inner.style.overflow).toBe("hidden");
    expect(inner.style.minHeight).toBe("0");
    destroy();
  });

  it("timeout を --collapse-duration に反映する（既定 150ms）", () => {
    const def = createCollapse();
    expect(def.el.style.getPropertyValue("--collapse-duration")).toBe("150ms");
    def.destroy();

    const custom = createCollapse({ timeout: 300 });
    expect(custom.el.style.getPropertyValue("--collapse-duration")).toBe("300ms");
    custom.destroy();
  });

  it("初期 in=false では grid-template-rows が 0fr（収縮）", () => {
    const { el, destroy } = createCollapse({ in: false });
    expect(el.style.gridTemplateRows).toBe("0fr");
    expect(el.getAttribute("data-open")).toBe("false");
    destroy();
  });

  it("初期 in=true では grid-template-rows が 1fr（展開）", () => {
    const { el, destroy } = createCollapse({ in: true });
    expect(el.style.gridTemplateRows).toBe("1fr");
    expect(el.getAttribute("data-open")).toBe("true");
    destroy();
  });

  it("setOpen(true) で rAF flush 後に 1fr へ展開する", () => {
    const { el, setOpen, destroy } = createCollapse({ in: false });
    setOpen(true);
    // visible は rAF 後に true（mount と同一フレームでの遷移開始を避ける設計）。
    expect(el.style.gridTemplateRows).toBe("0fr");
    flushRaf();
    expect(el.style.gridTemplateRows).toBe("1fr");
    expect(el.getAttribute("data-open")).toBe("true");
    destroy();
  });

  it("setOpen(false) で即座に 0fr へ収縮する", () => {
    const { el, setOpen, destroy } = createCollapse({ in: true });
    setOpen(false);
    expect(el.style.gridTemplateRows).toBe("0fr");
    expect(el.getAttribute("data-open")).toBe("false");
    destroy();
  });

  it("children（string / Node / 配列）を inner へ流し込む", () => {
    const node = document.createElement("span");
    node.id = "child-node";
    const { inner, destroy } = createCollapse({ children: ["text", node] });
    expect(inner.textContent).toContain("text");
    expect(inner.querySelector("#child-node")).toBe(node);
    destroy();
  });

  it("className を root に適用する", () => {
    const { el, destroy } = createCollapse({ className: "my-collapse" });
    expect(el.className).toBe("my-collapse");
    destroy();
  });

  describe("unmountOnExit", () => {
    it("初期 in=false では inner を DOM に追加しない", () => {
      const { el, inner, destroy } = createCollapse({ unmountOnExit: true, in: false });
      expect(inner.parentNode).toBeNull();
      expect(el.children.length).toBe(0);
      destroy();
    });

    it("初期 in=true では inner を DOM に追加する", () => {
      const { el, inner, destroy } = createCollapse({ unmountOnExit: true, in: true });
      expect(inner.parentNode).toBe(el);
      destroy();
    });

    it("setOpen(true) で inner を即時 mount し、rAF 後に展開する", () => {
      const { el, inner, setOpen, destroy } = createCollapse({ unmountOnExit: true, in: false });
      setOpen(true);
      expect(inner.parentNode).toBe(el);
      flushRaf();
      expect(el.style.gridTemplateRows).toBe("1fr");
      destroy();
    });

    it("setOpen(false) で timeout 経過後に inner を取り外す", () => {
      const { el, inner, setOpen, destroy } = createCollapse({
        unmountOnExit: true,
        in: true,
        timeout: 200,
      });
      setOpen(false);
      // 収縮アニメーション中は inner を保持する。
      expect(inner.parentNode).toBe(el);
      jest.advanceTimersByTime(199);
      expect(inner.parentNode).toBe(el);
      // timeout 経過で取り外す。
      jest.advanceTimersByTime(1);
      expect(inner.parentNode).toBeNull();
      destroy();
    });

    it("close → 即 open で進行中の unmount タイマーを破棄し inner を保持する", () => {
      const { el, inner, setOpen, destroy } = createCollapse({
        unmountOnExit: true,
        in: true,
        timeout: 200,
      });
      setOpen(false);
      setOpen(true);
      jest.advanceTimersByTime(1000);
      flushRaf();
      expect(inner.parentNode).toBe(el);
      expect(el.style.gridTemplateRows).toBe("1fr");
      destroy();
    });
  });

  describe("update", () => {
    it("className / timeout を差し替える", () => {
      const { el, update, destroy } = createCollapse({ className: "old", timeout: 150 });
      update({ className: "new", timeout: 400 });
      expect(el.className).toBe("new");
      expect(el.style.getPropertyValue("--collapse-duration")).toBe("400ms");
      destroy();
    });

    it("children を差し替える（旧コンテンツを除去して再構築）", () => {
      const { inner, update, destroy } = createCollapse({ children: "old" });
      expect(inner.textContent).toContain("old");
      const node = document.createElement("b");
      node.id = "fresh";
      update({ children: node });
      expect(inner.textContent).not.toContain("old");
      expect(inner.querySelector("#fresh")).toBe(node);
      destroy();
    });

    it("in の差し替えで開閉を切り替える", () => {
      const { el, update, destroy } = createCollapse({ in: false });
      update({ in: true });
      flushRaf();
      expect(el.style.gridTemplateRows).toBe("1fr");
      update({ in: false });
      expect(el.style.gridTemplateRows).toBe("0fr");
      destroy();
    });
  });

  describe("destroy", () => {
    it("進行中の rAF を解除し、以降の展開遷移を発火しない", () => {
      const { el, setOpen, destroy } = createCollapse({ in: false });
      setOpen(true); // rAF 予約（未 flush）
      destroy();
      expect(globalThis.cancelAnimationFrame).toHaveBeenCalled();
      flushRaf(); // cancel 済みなので no-op
      expect(el.style.gridTemplateRows).toBe("0fr");
    });

    it("進行中の unmount タイマーを解除し inner を取り外さない", () => {
      const { el, inner, setOpen, destroy } = createCollapse({
        unmountOnExit: true,
        in: true,
        timeout: 200,
      });
      setOpen(false); // unmount タイマー開始
      destroy();
      jest.advanceTimersByTime(1000);
      // destroy でタイマーが解除されるため inner は取り外されない。
      expect(inner.parentNode).toBe(el);
    });
  });
});
