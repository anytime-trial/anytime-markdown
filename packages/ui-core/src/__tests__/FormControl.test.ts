import { createFormControl } from "../FormControl";

describe("createFormControl", () => {
  it("既定で div を生成する", () => {
    const { el } = createFormControl();
    expect(el.tagName).toBe("DIV");
  });

  it("flex-direction:column の垂直スタックになる", () => {
    const { el } = createFormControl();
    expect(el.style.flexDirection).toBe("column");
  });

  it("fullWidth=true で width:100% が付与される", () => {
    const { el } = createFormControl({ fullWidth: true });
    expect(el.style.width).toBe("100%");
    expect(el.className).toContain("am-form-control--fullwidth");
  });

  it("fullWidth=false では width:100% が付与されない", () => {
    const { el } = createFormControl({ fullWidth: false });
    expect(el.style.width).not.toBe("100%");
  });

  it("error=true で data-error 属性が付与される", () => {
    const { el } = createFormControl({ error: true });
    expect(el.getAttribute("data-error")).toBe("true");
  });

  it("disabled=true で data-disabled 属性が付与される", () => {
    const { el } = createFormControl({ disabled: true });
    expect(el.getAttribute("data-disabled")).toBe("true");
  });

  it("children が流し込まれる", () => {
    const { el } = createFormControl({ children: "label text" });
    expect(el.textContent).toContain("label text");
  });

  it("className を付与する", () => {
    const { el } = createFormControl({ className: "custom" });
    expect(el.className).toContain("custom");
  });

  it("testId を data-testid に付与する", () => {
    const { el } = createFormControl({ testId: "fc-1" });
    expect(el.getAttribute("data-testid")).toBe("fc-1");
  });

  it("style を反映する", () => {
    const { el } = createFormControl({ style: { gap: "8px" } });
    expect(el.style.gap).toBe("8px");
  });
});
