import { createInputAdornment } from "../InputAdornment";

describe("createInputAdornment", () => {
  it("span 要素を生成する", () => {
    const { el } = createInputAdornment();
    expect(el.tagName).toBe("SPAN");
  });

  it("既定では position=start になる", () => {
    const { el } = createInputAdornment();
    expect(el.getAttribute("data-position")).toBe("start");
    expect(el.className).toContain("am-input-adornment--start");
  });

  it("position=end で end クラスと data 属性が付与される", () => {
    const { el } = createInputAdornment({ position: "end" });
    expect(el.getAttribute("data-position")).toBe("end");
    expect(el.className).toContain("am-input-adornment--end");
  });

  it("position=start で start クラスが付与される", () => {
    const { el } = createInputAdornment({ position: "start" });
    expect(el.className).toContain("am-input-adornment--start");
  });

  it("children がテキストとして含まれる", () => {
    const { el } = createInputAdornment({ children: "$" });
    expect(el.textContent).toContain("$");
  });

  it("Node を children として含められる", () => {
    const span = document.createElement("span");
    span.textContent = "icon";
    const { el } = createInputAdornment({ children: span });
    expect(el.contains(span)).toBe(true);
  });

  it("className を付与する", () => {
    const { el } = createInputAdornment({ className: "extra" });
    expect(el.className).toContain("extra");
  });

  it("testId を data-testid に付与する", () => {
    const { el } = createInputAdornment({ testId: "ia-1" });
    expect(el.getAttribute("data-testid")).toBe("ia-1");
  });

  it("style を反映する", () => {
    const { el } = createInputAdornment({ style: { fontSize: "12px" } });
    expect(el.style.fontSize).toBe("12px");
  });
});
