import { createButtonGroup } from "../ButtonGroup";

describe("createButtonGroup", () => {
  it("div[role=group] を生成する", () => {
    const { el } = createButtonGroup();
    expect(el.tagName).toBe("DIV");
    expect(el.getAttribute("role")).toBe("group");
  });

  it("am-button-group クラスを持つ", () => {
    const { el } = createButtonGroup();
    expect(el.className).toContain("am-button-group");
  });

  it("orientation=vertical で am-button-group--vertical クラスを付与する", () => {
    const { el } = createButtonGroup({ orientation: "vertical" });
    expect(el.className).toContain("am-button-group--vertical");
  });

  it("orientation=horizontal では vertical クラスを付与しない", () => {
    const { el } = createButtonGroup({ orientation: "horizontal" });
    expect(el.className).not.toContain("am-button-group--vertical");
  });

  it("fullWidth で am-button-group--full-width クラスを付与する", () => {
    const { el } = createButtonGroup({ fullWidth: true });
    expect(el.className).toContain("am-button-group--full-width");
  });

  it("children を流し込む", () => {
    const btn = document.createElement("button");
    btn.textContent = "A";
    const { el } = createButtonGroup({ children: btn });
    expect(el.contains(btn)).toBe(true);
  });

  it("className / ariaLabel / testId を反映する", () => {
    const { el } = createButtonGroup({ className: "extra", ariaLabel: "actions", testId: "bg-1" });
    expect(el.className).toContain("extra");
    expect(el.getAttribute("aria-label")).toBe("actions");
    expect(el.getAttribute("data-testid")).toBe("bg-1");
  });

  it("style を反映する", () => {
    const { el } = createButtonGroup({ style: { gap: "4px" } });
    expect(el.style.gap).toBe("4px");
  });
});
