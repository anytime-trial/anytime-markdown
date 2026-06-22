import { createList } from "../List";

describe("createList", () => {
  it("ul 要素を生成する", () => {
    const { el } = createList();
    expect(el.tagName).toBe("UL");
  });

  it("list-style:none のスタイルが適用されている", () => {
    const { el } = createList();
    expect(el.style.listStyle).toBe("none");
    expect(el.style.margin).toBe("0px");
    expect(el.style.padding).toBe("0px");
  });

  it("children を流し込む", () => {
    const li = document.createElement("li");
    li.textContent = "item";
    const { el } = createList({ children: li });
    expect(el.contains(li)).toBe(true);
  });

  it("dense オプションで data-dense 属性を付与する", () => {
    const { el } = createList({ dense: true });
    expect(el.getAttribute("data-dense")).toBe("true");
  });

  it("dense が false のとき data-dense 属性を付与しない", () => {
    const { el } = createList({ dense: false });
    expect(el.hasAttribute("data-dense")).toBe(false);
  });

  it("className を反映する", () => {
    const { el } = createList({ className: "my-list" });
    expect(el.className).toBe("my-list");
  });

  it("role を反映する", () => {
    const { el } = createList({ role: "listbox" });
    expect(el.getAttribute("role")).toBe("listbox");
  });

  it("ariaLabel を反映する", () => {
    const { el } = createList({ ariaLabel: "nav" });
    expect(el.getAttribute("aria-label")).toBe("nav");
  });

  it("testId を反映する", () => {
    const { el } = createList({ testId: "list-test" });
    expect(el.getAttribute("data-testid")).toBe("list-test");
  });

  it("style を反映する", () => {
    const { el } = createList({ style: { maxHeight: "200px" } });
    expect(el.style.maxHeight).toBe("200px");
  });
});
