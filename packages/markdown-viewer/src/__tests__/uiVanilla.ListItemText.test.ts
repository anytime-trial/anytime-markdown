/**
 * createListItemText（ui-vanilla/ListItemText）の jsdom ユニットテスト。
 *
 * 検証観点: DOM 生成 / cssText（flex 伸長・省略表示）/ children 流し込み / className・style 反映。
 *
 * 注意: jsdom は継承された CSS カスタムプロパティを getComputedStyle で解決しないため、
 * 色の computed 値は検証しない。代わりに el.style.cssText の内容を検証する。
 */

import { createListItemText } from "../ui-vanilla/ListItemText";

describe("ui-vanilla/ListItemText", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
  });

  it("span を生成する", () => {
    const { el } = createListItemText();
    expect(el.tagName).toBe("SPAN");
  });

  it("cssText が flex 伸長・余白 0・省略表示を含む", () => {
    const { el } = createListItemText();
    expect(el.style.cssText).toContain("flex: 1 1 auto");
    expect(el.style.cssText).toContain("min-width: 0");
    expect(el.style.cssText).toContain("margin: 0");
    expect(el.style.cssText).toContain("overflow: hidden");
    expect(el.style.cssText).toContain("text-overflow: ellipsis");
  });

  it("children（string）を流し込む", () => {
    const { el } = createListItemText({ children: "ラベル" });
    expect(el.textContent).toContain("ラベル");
  });

  it("children（Node 配列）を順に流し込む", () => {
    const a = document.createElement("b");
    a.textContent = "A";
    const b = document.createElement("i");
    b.textContent = "B";
    const { el } = createListItemText({ children: [a, b] });
    expect(el.textContent).toBe("AB");
  });

  it("className / style を反映する", () => {
    const { el } = createListItemText({
      className: "my-text",
      style: { fontWeight: "600" },
    });
    expect(el.className).toBe("my-text");
    expect(el.style.fontWeight).toBe("600");
  });
});
