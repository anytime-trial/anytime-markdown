import { computePlotRect } from "../engine/layout";

describe("computePlotRect", () => {
  it("軸ぶん左下に余白を確保する", () => {
    const p = computePlotRect(
      { x: 0, y: 0, width: 400, height: 300 },
      { hasTitle: false, legend: "none" },
    );
    expect(p.x).toBeGreaterThan(0);
    expect(p.width).toBeLessThan(400);
    expect(p.height).toBeLessThan(300);
    expect(p.width).toBeGreaterThan(0);
    expect(p.height).toBeGreaterThan(0);
  });
  it("タイトルありで上余白が増える", () => {
    const noTitle = computePlotRect({ x: 0, y: 0, width: 400, height: 300 }, { hasTitle: false, legend: "none" });
    const withTitle = computePlotRect({ x: 0, y: 0, width: 400, height: 300 }, { hasTitle: true, legend: "none" });
    expect(withTitle.y).toBeGreaterThan(noTitle.y);
  });
  it("near-line/adjacent 凡例で右余白が増える", () => {
    const none = computePlotRect({ x: 0, y: 0, width: 400, height: 300 }, { hasTitle: false, legend: "none" });
    const near = computePlotRect({ x: 0, y: 0, width: 400, height: 300 }, { hasTitle: false, legend: "near-line" });
    expect(near.width).toBeLessThan(none.width);
  });
});
