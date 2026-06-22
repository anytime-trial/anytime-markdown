import { createListItem } from "../ListItem";

describe("createListItem", () => {
  it("li 要素を生成する", () => {
    const { el } = createListItem();
    expect(el.tagName).toBe("LI");
  });

  it("children を流し込む", () => {
    const { el } = createListItem({ children: "item text" });
    expect(el.textContent).toBe("item text");
  });

  it("disablePadding が false のとき通常パディングを持つ", () => {
    const { el } = createListItem({ disablePadding: false });
    expect(el.hasAttribute("data-disable-padding")).toBe(false);
    // padding は "4px 0" 相当で cssText に含まれる
    expect(el.style.padding).not.toBe("0px");
  });

  it("disablePadding が true のとき padding:0 になる", () => {
    const { el } = createListItem({ disablePadding: true });
    expect(el.getAttribute("data-disable-padding")).toBe("true");
    expect(el.style.padding).toBe("0px");
  });

  it("className を反映する", () => {
    const { el } = createListItem({ className: "my-item" });
    expect(el.className).toBe("my-item");
  });

  it("role を反映する", () => {
    const { el } = createListItem({ role: "option" });
    expect(el.getAttribute("role")).toBe("option");
  });

  it("ariaLabel を反映する", () => {
    const { el } = createListItem({ ariaLabel: "row" });
    expect(el.getAttribute("aria-label")).toBe("row");
  });

  it("testId を反映する", () => {
    const { el } = createListItem({ testId: "li-test" });
    expect(el.getAttribute("data-testid")).toBe("li-test");
  });

  it("style を反映する", () => {
    const { el } = createListItem({ style: { color: "red" } });
    expect(el.style.color).toBe("red");
  });
});
