import { createInputLabel } from "../InputLabel";

describe("createInputLabel", () => {
  it("label 要素を生成する", () => {
    const { el } = createInputLabel();
    expect(el.tagName).toBe("LABEL");
  });

  it("children がテキストとして含まれる", () => {
    const { el } = createInputLabel({ children: "Email" });
    expect(el.textContent).toContain("Email");
  });

  it("shrink=false では shrink クラスが付かない", () => {
    const { el } = createInputLabel({ shrink: false });
    expect(el.className).not.toContain("am-input-label--shrink");
  });

  it("shrink=true で shrink クラスと data-shrink が付与される", () => {
    const { el } = createInputLabel({ shrink: true });
    expect(el.className).toContain("am-input-label--shrink");
    expect(el.getAttribute("data-shrink")).toBe("true");
  });

  it("error=true で error クラスと data-error が付与される", () => {
    const { el } = createInputLabel({ error: true });
    expect(el.className).toContain("am-input-label--error");
    expect(el.getAttribute("data-error")).toBe("true");
  });

  it("error=true でテキスト色が error-main CSS 変数になる", () => {
    const { el } = createInputLabel({ error: true });
    expect(el.style.cssText).toContain("--am-color-error-main");
  });

  it("htmlFor で for 属性が設定される", () => {
    const { el } = createInputLabel({ htmlFor: "my-input" });
    expect(el.getAttribute("for")).toBe("my-input");
  });

  it("className を付与する", () => {
    const { el } = createInputLabel({ className: "custom-label" });
    expect(el.className).toContain("custom-label");
  });

  it("testId を data-testid に付与する", () => {
    const { el } = createInputLabel({ testId: "il-1" });
    expect(el.getAttribute("data-testid")).toBe("il-1");
  });

  it("style を反映する", () => {
    const { el } = createInputLabel({ style: { color: "red" } });
    expect(el.style.color).toBe("red");
  });

  it("role / ariaLabel を付与する", () => {
    const { el } = createInputLabel({ role: "presentation", ariaLabel: "field" });
    expect(el.getAttribute("role")).toBe("presentation");
    expect(el.getAttribute("aria-label")).toBe("field");
  });
});
