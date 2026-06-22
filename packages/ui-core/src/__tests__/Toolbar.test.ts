import { createToolbar } from "../Toolbar";

describe("createToolbar", () => {
  it("div を生成する", () => {
    const { el } = createToolbar();
    expect(el.tagName).toBe("DIV");
  });

  it("am-toolbar クラスを持つ", () => {
    const { el } = createToolbar();
    expect(el.className).toContain("am-toolbar");
  });

  it("variant=dense で am-toolbar--dense クラスを付与する", () => {
    const { el } = createToolbar({ variant: "dense" });
    expect(el.className).toContain("am-toolbar--dense");
  });

  it("variant=regular では dense クラスを付与しない", () => {
    const { el } = createToolbar({ variant: "regular" });
    expect(el.className).not.toContain("am-toolbar--dense");
  });

  it("disableGutters で am-toolbar--no-gutters クラスを付与する", () => {
    const { el } = createToolbar({ disableGutters: true });
    expect(el.className).toContain("am-toolbar--no-gutters");
  });

  it("disableGutters=false では no-gutters クラスを付与しない", () => {
    const { el } = createToolbar({ disableGutters: false });
    expect(el.className).not.toContain("am-toolbar--no-gutters");
  });

  it("children を流し込む", () => {
    const { el } = createToolbar({ children: "Title" });
    expect(el.textContent).toContain("Title");
  });

  it("className / role / ariaLabel / testId を反映する", () => {
    const { el } = createToolbar({ className: "c", role: "toolbar", ariaLabel: "main", testId: "tb-1" });
    expect(el.className).toContain("c");
    expect(el.getAttribute("role")).toBe("toolbar");
    expect(el.getAttribute("aria-label")).toBe("main");
    expect(el.getAttribute("data-testid")).toBe("tb-1");
  });

  it("style を反映する", () => {
    const { el } = createToolbar({ style: { backgroundColor: "red" } });
    expect(el.style.backgroundColor).toBe("red");
  });
});
