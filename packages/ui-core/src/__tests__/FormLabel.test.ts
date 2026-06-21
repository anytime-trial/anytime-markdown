import { createFormLabel } from "../FormLabel";

describe("createFormLabel", () => {
  it("label 要素を生成する", () => {
    const { el } = createFormLabel();
    expect(el.tagName).toBe("LABEL");
  });

  it("children がテキストとして含まれる", () => {
    const { el } = createFormLabel({ children: "My Label" });
    expect(el.textContent).toContain("My Label");
  });

  it("error=false では error クラスが付かない", () => {
    const { el } = createFormLabel({ error: false });
    expect(el.className).not.toContain("am-form-label--error");
  });

  it("error=true で am-form-label--error クラスと data-error が付与される", () => {
    const { el } = createFormLabel({ error: true });
    expect(el.className).toContain("am-form-label--error");
    expect(el.getAttribute("data-error")).toBe("true");
  });

  it("error=true でテキスト色が error-main CSS 変数になる", () => {
    const { el } = createFormLabel({ error: true });
    // cssText contains error-main variable reference
    expect(el.style.cssText).toContain("--am-color-error-main");
  });

  it("className を付与する", () => {
    const { el } = createFormLabel({ className: "my-label" });
    expect(el.className).toContain("my-label");
  });

  it("testId を data-testid に付与する", () => {
    const { el } = createFormLabel({ testId: "fl-1" });
    expect(el.getAttribute("data-testid")).toBe("fl-1");
  });

  it("style を反映する", () => {
    const { el } = createFormLabel({ style: { fontWeight: "bold" } });
    expect(el.style.fontWeight).toBe("bold");
  });

  it("role / ariaLabel を付与する", () => {
    const { el } = createFormLabel({ role: "group", ariaLabel: "section" });
    expect(el.getAttribute("role")).toBe("group");
    expect(el.getAttribute("aria-label")).toBe("section");
  });
});
