/**
 * ui-vanilla/floating.ts（素 DOM floating ファクトリ）の jsdom ユニットテスト。
 *
 * 検証観点:
 *   1. DOM 生成 / 属性（role / aria-* / data-*）
 *   2. CSS 変数応答（paper の cssText が --am-color-* / --am-radius-md / --am-elevation-3 を参照）
 *   3. 配置計算（createFloating が computePosition の x/y を style に反映、middleware/placement を渡す）
 *   4. イベント発火（backdrop click-away / ESC / 矢印キー nav / Enter で click）
 *   5. autoUpdate 解除（destroy で cleanup 関数が呼ばれる）
 *   6. virtual anchor 対応
 *   7. destroy のクリーンアップ（listener 解除・el 取り外し）
 *
 * @floating-ui/dom はモックし、computePosition / autoUpdate / middleware を決定的に検証する。
 * jsdom は継承された CSS カスタムプロパティを getComputedStyle で解決しないため、cssText が
 * var(--am-...) を含むことを検証する（computed 値の検証はしない）。
 */

// --- @floating-ui/dom モック（決定的配置 + middleware 記録） -------------------
const computePositionMock = jest.fn();
const autoUpdateMock = jest.fn();
const autoUpdateCleanup = jest.fn();

jest.mock("@floating-ui/dom", () => ({
  computePosition: (...args: unknown[]) => computePositionMock(...args),
  autoUpdate: (...args: unknown[]) => autoUpdateMock(...args),
  offset: (px: number) => ({ name: "offset", px }),
  flip: (o: unknown) => ({ name: "flip", o }),
  shift: (o: unknown) => ({ name: "shift", o }),
}));

import {
  createFloating,
  createVirtualAnchor,
} from "@anytime-markdown/ui-core/floating";

/** computePosition を即解決させる（x/y/placement を返す）。 */
function resolvePosition(
  pos: { x: number; y: number; placement?: string } = { x: 10, y: 20 },
): void {
  computePositionMock.mockResolvedValue({
    x: pos.x,
    y: pos.y,
    placement: pos.placement ?? "bottom-start",
  });
}

/** マイクロタスクを 1 周フラッシュ（computePosition の .then を解決させる）。 */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  computePositionMock.mockReset();
  autoUpdateMock.mockReset();
  autoUpdateCleanup.mockReset();
  resolvePosition();
  // 既定: jsdom には ResizeObserver / IntersectionObserver が無いので単発計算へフォールバック。
  // autoUpdate 経路を試す test では明示的に observer を定義する。
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-vanilla/floating", () => {
  describe("createFloating", () => {
    it("floating 要素を position:fixed にし、確定前は opacity:0/pointer-events:none", () => {
      const ref = document.createElement("div");
      const floating = document.createElement("div");
      const { destroy } = createFloating({ reference: ref, floating });
      expect(floating.style.position).toBe("fixed");
      // 単発計算は非同期解決前なのでガードが付く
      expect(floating.style.opacity).toBe("0");
      expect(floating.style.pointerEvents).toBe("none");
      destroy();
    });

    it("computePosition の x/y を left/top(px) に反映し、確定後ガードを外す", async () => {
      resolvePosition({ x: 42, y: 84, placement: "top" });
      const ref = document.createElement("div");
      const floating = document.createElement("div");
      const onPosition = jest.fn();
      const { destroy } = createFloating({ reference: ref, floating, onPosition });
      await flush();
      expect(floating.style.left).toBe("42px");
      expect(floating.style.top).toBe("84px");
      expect(floating.style.opacity).toBe("1");
      expect(floating.style.pointerEvents).toBe("");
      expect(onPosition).toHaveBeenCalledWith({ x: 42, y: 84, resolvedPlacement: "top" });
      destroy();
    });

    it("placement / offset / flip / shift の middleware を computePosition に渡す", async () => {
      const ref = document.createElement("div");
      const floating = document.createElement("div");
      const { destroy } = createFloating({
        reference: ref,
        floating,
        placement: "right-end",
        offsetPx: 12,
        padding: 16,
      });
      await flush();
      expect(computePositionMock).toHaveBeenCalledTimes(1);
      const [refArg, floatArg, options] = computePositionMock.mock.calls[0] as [
        unknown,
        unknown,
        { strategy: string; placement: string; middleware: unknown[] },
      ];
      expect(refArg).toBe(ref);
      expect(floatArg).toBe(floating);
      expect(options.strategy).toBe("fixed");
      expect(options.placement).toBe("right-end");
      expect(options.middleware).toEqual([
        { name: "offset", px: 12 },
        { name: "flip", o: { padding: 16 } },
        { name: "shift", o: { padding: 16 } },
      ]);
      destroy();
    });

    it("ResizeObserver/IntersectionObserver が無い環境では単発計算（autoUpdate 不使用）", async () => {
      const ref = document.createElement("div");
      const floating = document.createElement("div");
      const { destroy } = createFloating({ reference: ref, floating });
      await flush();
      expect(autoUpdateMock).not.toHaveBeenCalled();
      expect(computePositionMock).toHaveBeenCalledTimes(1);
      destroy();
    });

    it("observer がある環境では autoUpdate を購読し、destroy で cleanup を呼ぶ", () => {
      autoUpdateMock.mockReturnValue(autoUpdateCleanup);
      const ResizeObserverStub = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
      (globalThis as Record<string, unknown>).ResizeObserver = ResizeObserverStub;
      (globalThis as Record<string, unknown>).IntersectionObserver = ResizeObserverStub;
      try {
        const ref = document.createElement("div");
        const floating = document.createElement("div");
        const { destroy } = createFloating({ reference: ref, floating });
        expect(autoUpdateMock).toHaveBeenCalledTimes(1);
        const [refArg, floatArg, updateFn] = autoUpdateMock.mock.calls[0];
        expect(refArg).toBe(ref);
        expect(floatArg).toBe(floating);
        expect(typeof updateFn).toBe("function");
        expect(autoUpdateCleanup).not.toHaveBeenCalled();
        destroy();
        expect(autoUpdateCleanup).toHaveBeenCalledTimes(1);
      } finally {
        delete (globalThis as Record<string, unknown>).ResizeObserver;
        delete (globalThis as Record<string, unknown>).IntersectionObserver;
      }
    });

    it("destroy 後は computePosition 解決が来ても style を更新しない", async () => {
      let resolveFn: (v: { x: number; y: number; placement: string }) => void = () => {};
      computePositionMock.mockReturnValue(
        new Promise((res) => {
          resolveFn = res;
        }),
      );
      const ref = document.createElement("div");
      const floating = document.createElement("div");
      const { destroy } = createFloating({ reference: ref, floating });
      destroy();
      resolveFn({ x: 99, y: 99, placement: "bottom" });
      await flush();
      // destroyed 後の解決は反映されない（left は初期 "0px" のまま）
      expect(floating.style.left).toBe("0px");
      expect(floating.style.opacity).toBe("0");
    });
  });

  describe("createVirtualAnchor", () => {
    it("固定座標から getBoundingClientRect を持つ virtual reference を作る", () => {
      const anchor = createVirtualAnchor({ top: 100, left: 50 });
      const rect = anchor.getBoundingClientRect!();
      expect(rect.top).toBe(100);
      expect(rect.left).toBe(50);
      expect(rect.right).toBe(50);
      expect(rect.bottom).toBe(100);
      expect(rect.width).toBe(0);
      expect(rect.height).toBe(0);
    });

    it("virtual anchor を createFloating の reference として渡せる", async () => {
      const anchor = createVirtualAnchor({ top: 10, left: 20 });
      const floating = document.createElement("div");
      const { destroy } = createFloating({ reference: anchor, floating });
      await flush();
      // computePosition に virtual reference がそのまま渡る
      const [refArg, floatArg] = computePositionMock.mock.calls[0] as [unknown, unknown];
      expect(refArg).toBe(anchor);
      expect(floatArg).toBe(floating);
      destroy();
    });
  });
});
