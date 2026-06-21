import { createBox } from "../Box";

describe("createBox", () => {
  it("既定で div を生成し children を入れる", () => {
    const { el } = createBox({ children: "hi" });
    expect(el.tagName).toBe("DIV");
    expect(el.textContent).toBe("hi");
  });
  it("component で要素種を変える", () => {
    const { el } = createBox({ component: "span" });
    expect(el.tagName).toBe("SPAN");
  });
  it("style を反映する", () => {
    const { el } = createBox({ style: { padding: "8px" } });
    expect(el.style.padding).toBe("8px");
  });
  it("testId / className / role を反映する", () => {
    const { el } = createBox({ testId: "b", className: "c", role: "group" });
    expect(el.getAttribute("data-testid")).toBe("b");
    expect(el.className).toBe("c");
    expect(el.getAttribute("role")).toBe("group");
  });
});
