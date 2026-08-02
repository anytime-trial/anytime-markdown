/**
 * ui-core/Menu.ts（素 DOM Menu ファクトリ）の jsdom ユニットテスト。
 *
 * 検証観点:
 *   1. DOM 生成 / 属性（role=menu / aria-label / data-* / tabIndex）
 *   2. CSS 変数応答（menu の cssText が --am-color-* / --am-radius-md / --am-elevation-3 を参照）
 *   3. floating 配置の委譲（createFloating 経由で computePosition に placement / offset を渡す）
 *      および anchorEl / anchorPosition（virtual rect）の双方対応
 *   4. キーボードナビ（↑↓ / Home / End は MenuList へ委譲し DOM フォーカスが移る、Enter/Space で
 *      アクティブ項目 click、ESC / Tab で onClose）
 *   5. backdrop の click / contextmenu で onClose
 *   6. 初期フォーカス（最初の有効 menuitem）/ destroy でのフォーカス復帰
 *   7. paperStyle / minWidth / children の反映
 *   8. destroy のクリーンアップ（listener 解除・el 取り外し・冪等）
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

import { createMenu } from "@anytime-markdown/ui-core/Menu";

/** テスト用の menuitem li を生成する。 */
function makeItem(label: string, opts: { disabled?: boolean } = {}): HTMLLIElement {
  const li = document.createElement("li");
  li.setAttribute("role", "menuitem");
  li.tabIndex = -1;
  li.textContent = label;
  if (opts.disabled) li.setAttribute("aria-disabled", "true");
  return li;
}

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

/** ul へ keydown を投げる。 */
function press(el: HTMLElement, key: string): KeyboardEvent {
  const evt = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  el.dispatchEvent(evt);
  return evt;
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

describe("ui-core/Menu", () => {
  describe("createMenu — 生成 / 属性", () => {
    it("backdrop + menu(ul role=menu) を内包する root を生成する", () => {
      const anchor = document.createElement("button");
      const { el, menu, destroy } = createMenu({ anchorEl: anchor, onClose: () => {} });
      expect(el.tagName).toBe("DIV");
      expect(el.getAttribute("data-am-menu-root")).toBe("");
      expect(el.querySelector("[data-am-menu-backdrop]")).not.toBeNull();
      expect(menu.tagName).toBe("UL");
      expect(menu.getAttribute("role")).toBe("menu");
      expect(menu.tabIndex).toBe(-1);
      expect(el.contains(menu)).toBe(true);
      destroy();
    });

    it("backdrop は z-index 1300 の固定オーバーレイ", () => {
      const anchor = document.createElement("button");
      const { el, destroy } = createMenu({ anchorEl: anchor, onClose: () => {} });
      const backdrop = el.querySelector<HTMLElement>("[data-am-menu-backdrop]")!;
      expect(backdrop.style.cssText).toContain("position: fixed");
      expect(backdrop.style.cssText).toContain("z-index: 1300");
      destroy();
    });

    it("ariaLabel を menu に設定する", () => {
      const anchor = document.createElement("button");
      const { menu, destroy } = createMenu({
        anchorEl: anchor,
        onClose: () => {},
        ariaLabel: "操作メニュー",
      });
      expect(menu.getAttribute("aria-label")).toBe("操作メニュー");
      destroy();
    });

    it("ariaLabel 未指定では aria-label を付けない", () => {
      const anchor = document.createElement("button");
      const { menu, destroy } = createMenu({ anchorEl: anchor, onClose: () => {} });
      expect(menu.hasAttribute("aria-label")).toBe(false);
      destroy();
    });
  });

  describe("createMenu — CSS 変数応答", () => {
    it("menu の cssText がテーマ CSS 変数を参照する", () => {
      const anchor = document.createElement("button");
      const { menu, destroy } = createMenu({ anchorEl: anchor, onClose: () => {} });
      expect(menu.style.cssText).toContain("var(--am-color-bg-paper)");
      expect(menu.style.cssText).toContain("var(--am-radius-md)");
      expect(menu.style.cssText).toContain("var(--am-elevation-3)");
      destroy();
    });

    it("menu の cssText が MenuList の padding 8px 0 を保持する", () => {
      const anchor = document.createElement("button");
      const { menu, destroy } = createMenu({ anchorEl: anchor, onClose: () => {} });
      expect(menu.style.cssText).toContain("padding: 8px 0");
      expect(menu.style.cssText).toContain("list-style: none");
      destroy();
    });

    it("minWidth を menu に適用する", () => {
      const anchor = document.createElement("button");
      const { menu, destroy } = createMenu({
        anchorEl: anchor,
        onClose: () => {},
        minWidth: 240,
      });
      expect(menu.style.minWidth).toBe("240px");
      destroy();
    });

    it("paperStyle を menu に適用する（テーマ既定を上書き）", () => {
      const anchor = document.createElement("button");
      const { menu, destroy } = createMenu({
        anchorEl: anchor,
        onClose: () => {},
        paperStyle: { maxWidth: "320px" },
      });
      expect(menu.style.maxWidth).toBe("320px");
      destroy();
    });
  });

  describe("createMenu — children 流し込み", () => {
    it("children（menuitem 群）を menu へ流し込む", () => {
      const anchor = document.createElement("button");
      const { menu, destroy } = createMenu({
        anchorEl: anchor,
        onClose: () => {},
        children: [makeItem("A"), makeItem("B"), makeItem("C")],
      });
      expect(menu.querySelectorAll('[role="menuitem"]').length).toBe(3);
      destroy();
    });
  });

  describe("createMenu — floating 配置の委譲", () => {
    it("既定 placement=bottom-start / offsetPx=2 を computePosition に渡す", async () => {
      const anchor = document.createElement("button");
      const { destroy } = createMenu({ anchorEl: anchor, onClose: () => {} });
      await flush();
      expect(computePositionMock).toHaveBeenCalledTimes(1);
      const [refArg, , options] = computePositionMock.mock.calls[0] as [
        unknown,
        unknown,
        { placement: string; middleware: Array<{ name: string; px?: number }> },
      ];
      expect(refArg).toBe(anchor);
      expect(options.placement).toBe("bottom-start");
      expect(options.middleware).toContainEqual({ name: "offset", px: 2 });
      destroy();
    });

    it("placement 指定を computePosition に伝播する", async () => {
      const anchor = document.createElement("button");
      const { destroy } = createMenu({
        anchorEl: anchor,
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

    it("anchorEl（実 DOM）を computePosition の reference に渡す", async () => {
      const anchor = document.createElement("button");
      const { menu, destroy } = createMenu({ anchorEl: anchor, onClose: () => {} });
      await flush();
      const [refArg, floatArg] = computePositionMock.mock.calls[0] as [unknown, unknown];
      expect(refArg).toBe(anchor);
      expect(floatArg).toBe(menu);
      destroy();
    });

    it("anchorPosition で virtual rect の getBoundingClientRect を reference に渡す", async () => {
      const { destroy } = createMenu({
        onClose: () => {},
        anchorReference: "anchorPosition",
        anchorPosition: { top: 30, left: 50 },
      });
      await flush();
      const [refArg] = computePositionMock.mock.calls[0] as [
        { getBoundingClientRect: () => DOMRect },
      ];
      expect(typeof refArg.getBoundingClientRect).toBe("function");
      const rect = refArg.getBoundingClientRect();
      expect(rect.top).toBe(30);
      expect(rect.left).toBe(50);
      expect(rect.width).toBe(0);
      expect(rect.height).toBe(0);
      destroy();
    });

    it("anchorEl が null でも computePosition がクラッシュしない（原点 virtual rect）", async () => {
      const { destroy } = createMenu({ anchorEl: null, onClose: () => {} });
      await flush();
      expect(computePositionMock).toHaveBeenCalledTimes(1);
      const [refArg] = computePositionMock.mock.calls[0] as [
        { getBoundingClientRect: () => DOMRect },
      ];
      const rect = refArg.getBoundingClientRect();
      expect(rect.top).toBe(0);
      expect(rect.left).toBe(0);
      destroy();
    });
  });

  describe("createMenu — backdrop イベント", () => {
    it("backdrop の click で onClose を呼ぶ", () => {
      const onClose = jest.fn();
      const anchor = document.createElement("button");
      const { el, destroy } = createMenu({ anchorEl: anchor, onClose });
      const backdrop = el.querySelector<HTMLElement>("[data-am-menu-backdrop]")!;
      backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(onClose).toHaveBeenCalledTimes(1);
      destroy();
    });

    it("backdrop の contextmenu で preventDefault + onClose を呼ぶ", () => {
      const onClose = jest.fn();
      const anchor = document.createElement("button");
      const { el, destroy } = createMenu({ anchorEl: anchor, onClose });
      const backdrop = el.querySelector<HTMLElement>("[data-am-menu-backdrop]")!;
      const evt = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
      backdrop.dispatchEvent(evt);
      expect(evt.defaultPrevented).toBe(true);
      expect(onClose).toHaveBeenCalledTimes(1);
      destroy();
    });
  });

  describe("createMenu — キーボードナビ", () => {
    it("初期状態で最初の有効 menuitem へフォーカスする", () => {
      const anchor = document.createElement("button");
      const a = makeItem("A");
      const b = makeItem("B");
      const { el, destroy } = createMenu({
        anchorEl: anchor,
        onClose: () => {},
        children: [a, b],
      });
      expect(document.activeElement).toBe(a);
      destroy();
    });

    it("先頭が disabled なら最初の有効項目へフォーカスする", () => {
      const anchor = document.createElement("button");
      const a = makeItem("A", { disabled: true });
      const b = makeItem("B");
      const { el, destroy } = createMenu({
        anchorEl: anchor,
        onClose: () => {},
        children: [a, b],
      });
      expect(document.activeElement).toBe(b);
      destroy();
    });

    it("ArrowDown で次の項目へフォーカスが移る（MenuList 委譲）", () => {
      const anchor = document.createElement("button");
      const a = makeItem("A");
      const b = makeItem("B");
      const { el, menu, destroy } = createMenu({
        anchorEl: anchor,
        onClose: () => {},
        children: [a, b],
      });
      press(menu, "ArrowDown");
      expect(document.activeElement).toBe(b);
      destroy();
    });

    it("ArrowUp は端で wraparound する（MenuList 委譲）", () => {
      const anchor = document.createElement("button");
      const a = makeItem("A");
      const b = makeItem("B");
      const { el, menu, destroy } = createMenu({
        anchorEl: anchor,
        onClose: () => {},
        children: [a, b],
      });
      // active=A(0) から ArrowUp → wraparound で末尾 B(1)。
      press(menu, "ArrowUp");
      expect(document.activeElement).toBe(b);
      destroy();
    });

    it("End で末尾へフォーカスが移る（MenuList 委譲）", () => {
      const anchor = document.createElement("button");
      const a = makeItem("A");
      const b = makeItem("B");
      const c = makeItem("C");
      const { el, menu, destroy } = createMenu({
        anchorEl: anchor,
        onClose: () => {},
        children: [a, b, c],
      });
      press(menu, "End");
      expect(document.activeElement).toBe(c);
      destroy();
    });

    it("Enter でアクティブ項目を click する（MenuList onSelect）", () => {
      const anchor = document.createElement("button");
      const clicked = jest.fn();
      const a = makeItem("A");
      a.addEventListener("click", clicked);
      const { el, menu, destroy } = createMenu({
        anchorEl: anchor,
        onClose: () => {},
        children: [a],
      });
      press(menu, "Enter");
      expect(clicked).toHaveBeenCalledTimes(1);
      destroy();
    });

    it("Space でアクティブ（フォーカス中）項目を click する", () => {
      const anchor = document.createElement("button");
      const clicked = jest.fn();
      const a = makeItem("A");
      a.addEventListener("click", clicked);
      const { el, menu, destroy } = createMenu({
        anchorEl: anchor,
        onClose: () => {},
        children: [a],
      });
      const evt = press(menu, " ");
      expect(evt.defaultPrevented).toBe(true);
      expect(clicked).toHaveBeenCalledTimes(1);
      destroy();
    });

    it("Escape で onClose を呼ぶ（MenuList onCancel）", () => {
      const onClose = jest.fn();
      const anchor = document.createElement("button");
      const { el, menu, destroy } = createMenu({
        anchorEl: anchor,
        onClose,
        children: [makeItem("A")],
      });
      press(menu, "Escape");
      expect(onClose).toHaveBeenCalledTimes(1);
      destroy();
    });

    it("Tab で preventDefault + onClose を呼ぶ", () => {
      const onClose = jest.fn();
      const anchor = document.createElement("button");
      const { el, menu, destroy } = createMenu({
        anchorEl: anchor,
        onClose,
        children: [makeItem("A")],
      });
      const evt = press(menu, "Tab");
      expect(evt.defaultPrevented).toBe(true);
      expect(onClose).toHaveBeenCalledTimes(1);
      destroy();
    });
  });

  describe("createMenu — フォーカス復帰", () => {
    it("destroy で直前のフォーカス要素へ復帰する（focus restoration）", () => {
      const trigger = document.createElement("button");
      trigger.textContent = "trigger";
      document.body.appendChild(trigger);
      trigger.focus();
      expect(document.activeElement).toBe(trigger);

      const anchor = document.createElement("button");
      const { el, destroy } = createMenu({
        anchorEl: anchor,
        onClose: () => {},
        children: [makeItem("A")],
      });
      destroy();
      expect(document.activeElement).toBe(trigger);
    });

    it("Menu はモーダルでないため背景スクロールをロックしない", () => {
      document.body.style.overflow = "scroll";
      const anchor = document.createElement("button");
      const { el, destroy } = createMenu({
        anchorEl: anchor,
        onClose: () => {},
        children: [makeItem("A")],
      });
      expect(document.body.style.overflow).toBe("scroll");
      destroy();
      expect(document.body.style.overflow).toBe("scroll");
    });

    it("Menu はモーダルでないため背景 sibling に aria-hidden を付けない", () => {
      const sibling = document.createElement("div");
      document.body.appendChild(sibling);
      const anchor = document.createElement("button");
      const { el, destroy } = createMenu({
        anchorEl: anchor,
        onClose: () => {},
        children: [makeItem("A")],
      });
      expect(sibling.getAttribute("aria-hidden")).toBeNull();
      destroy();
      expect(sibling.getAttribute("aria-hidden")).toBeNull();
    });
  });

  describe("createMenu — destroy クリーンアップ", () => {
    it("destroy で listener を解除し el を親から取り外す", () => {
      const onClose = jest.fn();
      const anchor = document.createElement("button");
      const { el, menu, destroy } = createMenu({
        anchorEl: anchor,
        onClose,
        children: [makeItem("A")],
      });
      destroy();
      expect(el.parentElement).toBeNull();
      // listener が解除されているので onClose は増えない。
      press(menu, "Escape");
      press(menu, "Tab");
      const backdrop = el.querySelector<HTMLElement>("[data-am-menu-backdrop]")!;
      backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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
      const { menu, destroy } = createMenu({ anchorEl: anchor, onClose: () => {} });
      destroy();
      resolveFn({ x: 99, y: 99, placement: "bottom" });
      await flush();
      // createFloating が destroyed 済みなので left は初期 "0px" のまま。
      expect(menu.style.left).toBe("0px");
    });

    it("destroy は冪等（複数回呼んでもエラーにならない）", () => {
      const anchor = document.createElement("button");
      const { destroy } = createMenu({ anchorEl: anchor, onClose: () => {} });
      expect(() => {
        destroy();
        destroy();
      }).not.toThrow();
    });
  });
});
