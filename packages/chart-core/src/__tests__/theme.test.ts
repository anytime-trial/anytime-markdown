import { getChartTheme, contrastRatio } from "../theme";

describe("getChartTheme", () => {
  it("light の系列色は #3460FB を含む", () => {
    expect(getChartTheme("light").palette.series).toContain("#3460FB");
  });
  it("dark mode を返す", () => {
    expect(getChartTheme("dark").mode).toBe("dark");
  });
  it("パレットキーで系統を切り替える", () => {
    expect(getChartTheme("light", "orange").palette.series).toContain("#FB5B01");
  });
});

describe("contrastRatio", () => {
  it("白対 #3460FB は 3:1 以上", () => {
    expect(contrastRatio("#FFFFFF", "#3460FB")).toBeGreaterThanOrEqual(3);
  });
  it("白対白は 1", () => {
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 1);
  });
  it("黒対白は 21 に近い", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeGreaterThan(20);
  });
});
