/**
 * createMenuItem（ui-core/MenuItem）の jsdom ユニットテスト。
 *
 * 検証観点: DOM 生成 / role / tabIndex / aria-disabled / CSS 変数参照（cssText）/ dense /
 * selected / disabled / hover トグル / click 発火（disabled 抑止）/ update / destroy のクリーンアップ。
 *
 * 注意: jsdom は継承された CSS カスタムプロパティを getComputedStyle で解決しないため、
 * 色の computed 値は検証しない。代わりに el.style.cssText が var(--am-...) を含むことを検証する。
 */

import { createMenuItem } from "@anytime-markdown/ui-core/MenuItem";

describe("ui-core/MenuItem", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
  });

  it("li[role=menuitem] を tabIndex=-1 で生成する", () => {
    const { el } = createMenuItem({ children: "Item" });
    expect(el.tagName).toBe("LI");
    expect(el.getAttribute("role")).toBe("menuitem");
    expect(el.tabIndex).toBe(-1);
    expect(el.textContent).toContain("Item");
  });

  it("cssText が text-primary 色・font 変数・min-height 変数を参照する", () => {
    const { el } = createMenuItem();
    expect(el.style.cssText).toContain("color: var(--am-color-text-primary)");
    expect(el.style.cssText).toContain("font-size: var(--am-menu-item-font, 1rem)");
    expect(el.style.cssText).toContain("min-height: var(--am-menu-item-minh, 48px)");
  });

  it("dense は CSS 変数を局所上書きする", () => {
    const { el } = createMenuItem({ dense: true });
    expect(el.style.cssText).toContain("--am-menu-item-minh: 32px");
    expect(el.style.cssText).toContain("--am-menu-item-font: 0.875rem");
  });

  it("selected は action.selected 背景を付与する", () => {
    const { el } = createMenuItem({ selected: true });
    expect(el.style.cssText).toContain("background-color: var(--am-color-action-selected)");
  });

  it("disabled は aria-disabled=true と opacity 0.38 を付与する", () => {
    const { el } = createMenuItem({ disabled: true });
    expect(el.getAttribute("aria-disabled")).toBe("true");
    expect(el.style.cssText).toContain("opacity: 0.38");
    expect(el.style.cssText).toContain("pointer-events: none");
  });

  it("role / tabIndex / className / testId を設定できる", () => {
    const { el } = createMenuItem({
      role: "option",
      tabIndex: 0,
      className: "my-item",
      testId: "item-1",
    });
    expect(el.getAttribute("role")).toBe("option");
    expect(el.tabIndex).toBe(0);
    expect(el.className).toBe("my-item");
    expect(el.getAttribute("data-testid")).toBe("item-1");
  });

  it("consumer style は cssText より優先される", () => {
    const { el } = createMenuItem({ style: { fontSize: "13px" } });
    expect(el.style.fontSize).toBe("13px");
  });

  it("pointerenter で hover 背景を付け、pointerleave で透明に戻す", () => {
    const { el } = createMenuItem();
    el.dispatchEvent(new Event("pointerenter"));
    expect(el.style.backgroundColor).toContain("var(--am-color-action-hover)");
    el.dispatchEvent(new Event("pointerleave"));
    expect(el.style.backgroundColor).toBe("transparent");
  });

  it("selected 項目は hover 背景を変えない", () => {
    const { el } = createMenuItem({ selected: true });
    const before = el.style.backgroundColor;
    el.dispatchEvent(new Event("pointerenter"));
    expect(el.style.backgroundColor).toBe(before);
  });

  it("disabled 項目は hover 背景を付けない", () => {
    const { el } = createMenuItem({ disabled: true });
    el.dispatchEvent(new Event("pointerenter"));
    expect(el.style.backgroundColor).not.toContain("hover");
  });

  it("click で onClick が発火する", () => {
    const onClick = jest.fn();
    const { el } = createMenuItem({ onClick });
    el.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disabled では click しても onClick が発火しない", () => {
    const onClick = jest.fn();
    const { el } = createMenuItem({ disabled: true, onClick });
    el.click();
    expect(onClick).not.toHaveBeenCalled();
  });

  describe("update", () => {
    it("selected を切り替えると cssText が更新される", () => {
      const { el, update } = createMenuItem();
      expect(el.style.cssText).not.toContain("action-selected");
      update({ selected: true });
      expect(el.style.cssText).toContain("var(--am-color-action-selected)");
      update({ selected: false });
      expect(el.style.cssText).not.toContain("action-selected");
    });

    it("disabled を切り替えると aria-disabled が同期する", () => {
      const { el, update } = createMenuItem();
      expect(el.getAttribute("aria-disabled")).toBeNull();
      update({ disabled: true });
      expect(el.getAttribute("aria-disabled")).toBe("true");
      update({ disabled: false });
      expect(el.getAttribute("aria-disabled")).toBeNull();
    });

    it("children を差し替える", () => {
      const { el, update } = createMenuItem({ children: "old" });
      update({ children: "new" });
      expect(el.textContent).toBe("new");
    });

    it("onClick を差し替えると旧ハンドラは呼ばれない", () => {
      const first = jest.fn();
      const second = jest.fn();
      const { el, update } = createMenuItem({ onClick: first });
      update({ onClick: second });
      el.click();
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });
  });

  it("destroy 後は click / pointerenter が反応しない", () => {
    const onClick = jest.fn();
    const { el, destroy } = createMenuItem({ onClick });
    destroy();
    el.click();
    expect(onClick).not.toHaveBeenCalled();
    el.style.backgroundColor = "transparent";
    el.dispatchEvent(new Event("pointerenter"));
    expect(el.style.backgroundColor).toBe("transparent");
  });
});
