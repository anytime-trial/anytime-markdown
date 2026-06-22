import { createButtonBase } from "../ButtonBase";

describe("createButtonBase", () => {
  it("既定で button[type=button] を生成する", () => {
    const { el } = createButtonBase();
    expect(el.tagName).toBe("BUTTON");
    expect(el.type).toBe("button");
  });

  it("children をコンテンツとして流し込む", () => {
    const { el } = createButtonBase({ children: "Click me" });
    expect(el.textContent).toBe("Click me");
  });

  it("className に am-btn-base を含む", () => {
    const { el } = createButtonBase();
    expect(el.className).toContain("am-btn-base");
  });

  it("追加 className を am-btn-base と結合する", () => {
    const { el } = createButtonBase({ className: "my-class" });
    expect(el.className).toContain("am-btn-base");
    expect(el.className).toContain("my-class");
  });

  it("testId / ariaLabel / role を反映する", () => {
    const { el } = createButtonBase({ testId: "btn-1", ariaLabel: "close", role: "menuitem" });
    expect(el.getAttribute("data-testid")).toBe("btn-1");
    expect(el.getAttribute("aria-label")).toBe("close");
    expect(el.getAttribute("role")).toBe("menuitem");
  });

  it("style を反映する", () => {
    const { el } = createButtonBase({ style: { padding: "8px" } });
    expect(el.style.padding).toBe("8px");
  });

  it("disabled を反映する", () => {
    const { el } = createButtonBase({ disabled: true });
    expect(el.disabled).toBe(true);
  });

  it("onClick がクリックで発火する", () => {
    const handler = jest.fn();
    const { el } = createButtonBase({ onClick: handler });
    el.click();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("disabled のとき button.disabled = true になる", () => {
    const { el } = createButtonBase({ disabled: true });
    expect(el.disabled).toBe(true);
  });

  it("type='submit' を反映する", () => {
    const { el } = createButtonBase({ type: "submit" });
    expect(el.type).toBe("submit");
  });
});
