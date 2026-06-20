/**
 * createListItemIcon（ui-vanilla/ListItemIcon）の jsdom ユニットテスト。
 *
 * 検証観点: DOM 生成 / CSS 変数参照（cssText）/ children 流し込み / className・style 反映。
 *
 * 注意: jsdom は継承された CSS カスタムプロパティを getComputedStyle で解決しないため、
 * 色の computed 値は検証しない。代わりに el.style.cssText が var(--am-...) を含むことを検証する。
 */

import { createListItemIcon } from "@anytime-markdown/graph-core/ui-vanilla/ListItemIcon";

describe("ui-vanilla/ListItemIcon", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
  });

  it("span を生成する", () => {
    const { el } = createListItemIcon();
    expect(el.tagName).toBe("SPAN");
  });

  it("cssText が minWidth 変数と action.active 色を参照する", () => {
    const { el } = createListItemIcon();
    expect(el.style.cssText).toContain("min-width: var(--am-menu-icon-minw, 36px)");
    expect(el.style.cssText).toContain("color: var(--am-color-action-active)");
    expect(el.style.cssText).toContain("inline-flex");
    expect(el.style.cssText).toContain("flex-shrink: 0");
  });

  it("children（Node）を流し込む", () => {
    const svg = document.createElement("span");
    svg.textContent = "icon";
    const { el } = createListItemIcon({ children: svg });
    expect(el.contains(svg)).toBe(true);
    expect(el.textContent).toBe("icon");
  });

  it("children（string）は span でラップして流し込む", () => {
    const { el } = createListItemIcon({ children: "X" });
    expect(el.querySelector("span")?.textContent).toBe("X");
  });

  it("className / style を反映する", () => {
    const { el } = createListItemIcon({
      className: "my-icon",
      style: { minWidth: "20px" },
    });
    expect(el.className).toBe("my-icon");
    // consumer style は cssText 適用後に上書きされる。
    expect(el.style.minWidth).toBe("20px");
  });
});
