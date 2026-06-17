import { linearScale, niceTicks } from "../engine/scales";

describe("linearScale", () => {
  it("domain→range を線形写像する", () => {
    const s = linearScale([0, 100], [0, 200]);
    expect(s(0)).toBe(0);
    expect(s(50)).toBe(100);
    expect(s(100)).toBe(200);
  });
  it("range を反転できる（canvas の y は上が小）", () => {
    const s = linearScale([0, 10], [300, 0]);
    expect(s(0)).toBe(300);
    expect(s(10)).toBe(0);
  });
  it("退化 domain でも例外を投げない", () => {
    const s = linearScale([5, 5], [0, 100]);
    expect(Number.isFinite(s(5))).toBe(true);
  });
});

describe("niceTicks", () => {
  it("0 起点の綺麗な刻みを返す（最大値を覆う）", () => {
    const t = niceTicks(0, 14200, 5);
    expect(t[0]).toBe(0);
    expect(t.at(-1)!).toBeGreaterThanOrEqual(14200);
  });
  it("負の最小値があっても 0 を下限に含める（zeroBaseline）", () => {
    const t = niceTicks(120, 980, 5);
    expect(t[0]).toBe(0);
  });
});
