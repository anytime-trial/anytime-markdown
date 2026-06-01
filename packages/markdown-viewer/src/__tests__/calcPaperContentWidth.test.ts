import { calcPaperContentWidth } from "../constants/dimensions";

describe("calcPaperContentWidth", () => {
  it("A4 余白20mm → 643px", () => {
    expect(calcPaperContentWidth("A4", 20)).toBe(Math.round(170 * (96 / 25.4)));
  });

  it("A3 余白20mm → 972px", () => {
    expect(calcPaperContentWidth("A3", 20)).toBe(Math.round(257 * (96 / 25.4)));
  });

  it("B4 余白20mm → 820px", () => {
    expect(calcPaperContentWidth("B4", 20)).toBe(Math.round(217 * (96 / 25.4)));
  });

  it("B5 余白20mm → 537px", () => {
    expect(calcPaperContentWidth("B5", 20)).toBe(Math.round(142 * (96 / 25.4)));
  });

  it("余白を変更すると幅が変わる", () => {
    const w10 = calcPaperContentWidth("A4", 10);
    const w40 = calcPaperContentWidth("A4", 40);
    expect(w10).toBeGreaterThan(w40);
  });
});
