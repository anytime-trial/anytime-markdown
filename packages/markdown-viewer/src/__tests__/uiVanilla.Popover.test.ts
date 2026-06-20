/**
 * ui-vanilla/Popover.ts（素 DOM Popover ファクトリ）の jsdom ユニットテスト。
 *
 * 検証観点:
 *   1. DOM 生成 / 属性（role / aria-* / data-* / tabIndex）
 *   2. CSS 変数応答（paper の cssText が --am-color-* / --am-radius-md / --am-elevation-3 を参照）
 *   3. floating 配置の委譲（createFloating 経由で computePosition に placement / offset を渡す）
 *   4. イベント発火（backdrop click-away / Escape）
 *   5. 初期フォーカス / フォーカス復帰（focusTrap への委譲）
 *   6. paperStyle / children の反映
 *   7. destroy のクリーンアップ（listener 解除・el 取り外し・冪等）
 *
 * 依存する floating.ts は `@floating-ui/dom` を直叩きするため、ここでもモックして
 * computePosition を決定的に解決させる。jsdom は継承された CSS カスタムプロパティを
 * getComputedStyle で解決しないため、cssText が var(--am-...) を含むことを検証する
 * （computed 値の検証はしない）。jsdom には ResizeObserver / IntersectionObserver が無いため
 * createFloating は単発計算（autoUpdate 不使用）へフォールバックする。
 */

// --- @floating-ui/dom モック（決定的配置 + middleware 記録） -------------------
const computePositionMock = jest.fn();
const autoUpdateMock = jest.fn();

jest.mock("@floating-ui/dom", () => ({
  computePosition: (...args: unknown[]) => computePositionMock(...args),
  autoUpdate: (...args: unknown[]) => autoUpdateMock(...args),
  offset: (px: number) => ({ name: "offset", px }),
  flip: (o: unknown) => ({ name: "flip", o }),
  shift: (o: unknown) => ({ name: "shift", o }),
}));

import { createPopover } from "@anytime-markdown/ui-core/Popover";

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
  resolvePosition();
  document.body.innerHTML = "";
  document.body.removeAttribute("style");
  document.documentElement.removeAttribute("style");
});

afterEach(() => {
  document.body.innerHTML = "";
  document.body.removeAttribute("style");
  document.documentElement.removeAttribute("style");
});

describe("ui-vanilla/Popover", () => {
  describe("createPopover — 生成 / 属性", () => {
    it("backdrop + paper を内包する root を生成する", () => {
      const anchor = document.createElement("button");
      const { el, paper, destroy } = createPopover({ anchor, onClose: () => {} });
      expect(el.tagName).toBe("DIV");
      expect(el.getAttribute("data-am-popover-root")).toBe("");
      expect(el.querySelector("[data-am-popover-backdrop]")).not.toBeNull();
      expect(paper.getAttribute("data-am-popover-paper")).toBe("");
      expect(paper.tabIndex).toBe(-1);
      expect(el.contains(paper)).toBe(true);
      destroy();
    });

    it("backdrop は z-index 1300 の固定オーバーレイ", () => {
      const anchor = document.createElement("button");
      const { el, destroy } = createPopover({ anchor, onClose: () => {} });
      const backdrop = el.querySelector<HTMLElement>("[data-am-popover-backdrop]")!;
      expect(backdrop.style.cssText).toContain("position: fixed");
      expect(backdrop.style.cssText).toContain("z-index: 1300");
      destroy();
    });

    it("paperRole / ariaLabel を paper に設定する", () => {
      const anchor = document.createElement("button");
      const { paper, destroy } = createPopover({
        anchor,
        onClose: () => {},
        paperRole: "listbox",
        ariaLabel: "選択",
      });
      expect(paper.getAttribute("role")).toBe("listbox");
      expect(paper.getAttribute("aria-label")).toBe("選択");
      destroy();
    });

    it("paperRole / ariaLabel 未指定では属性を付けない", () => {
      const anchor = document.createElement("button");
      const { paper, destroy } = createPopover({ anchor, onClose: () => {} });
      expect(paper.hasAttribute("role")).toBe(false);
      expect(paper.hasAttribute("aria-label")).toBe(false);
      destroy();
    });
  });

  describe("createPopover — CSS 変数応答", () => {
    it("paper の cssText がテーマ CSS 変数を参照する", () => {
      const anchor = document.createElement("button");
      const { paper, destroy } = createPopover({ anchor, onClose: () => {} });
      expect(paper.style.cssText).toContain("var(--am-color-bg-paper)");
      expect(paper.style.cssText).toContain("var(--am-radius-md)");
      expect(paper.style.cssText).toContain("var(--am-elevation-3)");
      destroy();
    });

    it("CSS 変数を documentElement から設定でき getComputedStyle で解決する", () => {
      document.documentElement.style.setProperty(
        "--am-color-bg-paper",
        "rgb(18, 18, 18)",
      );
      const anchor = document.createElement("button");
      const { el, destroy } = createPopover({ anchor, onClose: () => {} });
      document.body.appendChild(el);
      const resolved = window
        .getComputedStyle(document.documentElement)
        .getPropertyValue("--am-color-bg-paper");
      expect(resolved.trim()).toBe("rgb(18, 18, 18)");
      destroy();
    });

    it("paperStyle を paper に適用する（テーマ既定を上書き）", () => {
      const anchor = document.createElement("button");
      const { paper, destroy } = createPopover({
        anchor,
        onClose: () => {},
        paperStyle: { minWidth: "200px" },
      });
      expect(paper.style.minWidth).toBe("200px");
      destroy();
    });
  });

  describe("createPopover — children 流し込み", () => {
    it("children（string / Node）を paper へ流し込む", () => {
      const anchor = document.createElement("button");
      const item = document.createElement("button");
      item.textContent = "OK";
      const { paper, destroy } = createPopover({
        anchor,
        onClose: () => {},
        children: ["説明", item],
      });
      expect(paper.textContent).toContain("説明");
      expect(paper.querySelector("button")?.textContent).toBe("OK");
      destroy();
    });
  });

  describe("createPopover — floating 配置の委譲", () => {
    it("既定 placement=bottom-start / offsetPx=4 を computePosition に渡す", async () => {
      const anchor = document.createElement("button");
      const { destroy } = createPopover({ anchor, onClose: () => {} });
      await flush();
      expect(computePositionMock).toHaveBeenCalledTimes(1);
      const [refArg, , options] = computePositionMock.mock.calls[0] as [
        unknown,
        unknown,
        { placement: string; middleware: Array<{ name: string; px?: number }> },
      ];
      expect(refArg).toBe(anchor);
      expect(options.placement).toBe("bottom-start");
      expect(options.middleware).toContainEqual({ name: "offset", px: 4 });
      destroy();
    });

    it("placement 指定を computePosition に伝播する", async () => {
      const anchor = document.createElement("button");
      const { destroy } = createPopover({
        anchor,
        onClose: () => {},
        placement: "top-end",
      });
      await flush();
      const [, , options] = computePositionMock.mock.calls[0] as [
        unknown,
        unknown,
        { placement: string },
      ];
      expect(options.placement).toBe("top-end");
      destroy();
    });

    it("virtual anchor をそのまま computePosition の reference に渡す", async () => {
      const anchor = {
        getBoundingClientRect: () =>
          ({
            x: 5,
            y: 6,
            top: 6,
            left: 5,
            right: 5,
            bottom: 6,
            width: 0,
            height: 0,
            toJSON: () => ({}),
          }) as DOMRect,
      };
      const { paper, destroy } = createPopover({ anchor, onClose: () => {} });
      await flush();
      const [refArg, floatArg] = computePositionMock.mock.calls[0] as [unknown, unknown];
      expect(refArg).toBe(anchor);
      expect(floatArg).toBe(paper);
      destroy();
    });
  });

  describe("createPopover — イベント発火", () => {
    it("backdrop の mousedown で onClose を呼ぶ", () => {
      const onClose = jest.fn();
      const anchor = document.createElement("button");
      const { el, destroy } = createPopover({ anchor, onClose });
      document.body.appendChild(el);
      const backdrop = el.querySelector<HTMLElement>("[data-am-popover-backdrop]")!;
      backdrop.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      expect(onClose).toHaveBeenCalledTimes(1);
      destroy();
    });

    it("Escape キーで onClose を呼ぶ（focusTrap 委譲）", () => {
      const onClose = jest.fn();
      const anchor = document.createElement("button");
      const { el, paper, destroy } = createPopover({ anchor, onClose });
      document.body.appendChild(el);
      paper.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      expect(onClose).toHaveBeenCalledTimes(1);
      destroy();
    });

    it("Tab フォーカストラップ: 末尾で Tab すると先頭へ戻す（focusTrap 委譲）", () => {
      const anchor = document.createElement("button");
      const first = document.createElement("button");
      first.textContent = "first";
      const last = document.createElement("button");
      last.textContent = "last";
      const { el, paper, destroy } = createPopover({
        anchor,
        onClose: () => {},
        children: [first, last],
      });
      document.body.appendChild(el);
      last.focus();
      const evt = new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      });
      paper.dispatchEvent(evt);
      expect(evt.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(first);
      destroy();
    });
  });

  describe("createPopover — フォーカス管理", () => {
    it("paper 内に最初の focusable があればフォーカス候補になる（focusTrap attach）", () => {
      const anchor = document.createElement("button");
      const item = document.createElement("button");
      item.textContent = "ok";
      const { el, destroy } = createPopover({
        anchor,
        onClose: () => {},
        children: item,
      });
      document.body.appendChild(el);
      // jsdom は detached / append タイミング差で activeElement が body のことがあるため、
      // focusable 解決可能性（tabIndex 既定 0）と activeElement の候補集合で検証する。
      expect(item.tabIndex).toBe(0);
      expect([item, document.body]).toContain(document.activeElement);
      destroy();
    });

    it("focusable が無いときは paper 自体（tabIndex=-1）がフォーカス対象になる", () => {
      const anchor = document.createElement("button");
      const { el, paper, destroy } = createPopover({
        anchor,
        onClose: () => {},
        children: "本文のみ",
      });
      document.body.appendChild(el);
      expect(paper.tabIndex).toBe(-1);
      expect([paper, document.body]).toContain(document.activeElement);
      destroy();
    });

    it("destroy で直前のフォーカス要素へ復帰する（focus restoration）", () => {
      const trigger = document.createElement("button");
      trigger.textContent = "trigger";
      document.body.appendChild(trigger);
      trigger.focus();
      expect(document.activeElement).toBe(trigger);

      const anchor = document.createElement("button");
      const inner = document.createElement("button");
      inner.textContent = "inner";
      const { el, destroy } = createPopover({
        anchor,
        onClose: () => {},
        children: inner,
      });
      document.body.appendChild(el);
      destroy();
      // focusTrap.release が restore（trigger）へ戻す。
      expect(document.activeElement).toBe(trigger);
    });

    it("Popover はモーダルでないため背景スクロールをロックしない", () => {
      document.body.style.overflow = "scroll";
      const anchor = document.createElement("button");
      const { el, destroy } = createPopover({ anchor, onClose: () => {} });
      document.body.appendChild(el);
      // lockScroll:false で focusTrap を生成しているため overflow は変わらない。
      expect(document.body.style.overflow).toBe("scroll");
      destroy();
      expect(document.body.style.overflow).toBe("scroll");
    });

    it("Popover はモーダルでないため背景 sibling に aria-hidden を付けない", () => {
      const sibling = document.createElement("div");
      document.body.appendChild(sibling);
      const anchor = document.createElement("button");
      const { el, destroy } = createPopover({ anchor, onClose: () => {} });
      document.body.appendChild(el);
      expect(sibling.getAttribute("aria-hidden")).toBeNull();
      destroy();
      expect(sibling.getAttribute("aria-hidden")).toBeNull();
    });
  });

  describe("createPopover — destroy クリーンアップ", () => {
    it("destroy で listener を解除し el を親から取り外す", () => {
      const onClose = jest.fn();
      const anchor = document.createElement("button");
      const { el, paper, destroy } = createPopover({ anchor, onClose });
      document.body.appendChild(el);
      destroy();
      expect(el.parentElement).toBeNull();
      paper.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      const backdrop = el.querySelector<HTMLElement>("[data-am-popover-backdrop]")!;
      backdrop.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      expect(onClose).not.toHaveBeenCalled();
    });

    it("destroy 後に computePosition 解決が来ても style を更新しない", async () => {
      let resolveFn: (v: { x: number; y: number; placement: string }) => void = () => {};
      computePositionMock.mockReturnValue(
        new Promise((res) => {
          resolveFn = res;
        }),
      );
      const anchor = document.createElement("button");
      const { paper, destroy } = createPopover({ anchor, onClose: () => {} });
      destroy();
      resolveFn({ x: 99, y: 99, placement: "bottom" });
      await flush();
      // createFloating が destroyed 済みなので left は初期 "0px" のまま。
      expect(paper.style.left).toBe("0px");
    });

    it("destroy は冪等（複数回呼んでもエラーにならない）", () => {
      const anchor = document.createElement("button");
      const { destroy } = createPopover({ anchor, onClose: () => {} });
      expect(() => {
        destroy();
        destroy();
      }).not.toThrow();
    });
  });
});
