import { chartSpecToCells, cellsToChartSpec } from "../data/tableSpec";
import type { ChartSpec } from "../types";

describe("chartSpecToCells / cellsToChartSpec — line/bar", () => {
  const spec: ChartSpec = {
    kind: "line",
    title: "売上",
    categories: ["Jan", "Feb"],
    series: [
      { name: "売上", values: [100, 120] },
      { name: "原価", values: [60, 70] },
    ],
    options: { legend: "near-line" },
  };

  it("spec→cells は先頭行=系列名・先頭列=カテゴリ", () => {
    const cells = chartSpecToCells(spec);
    expect(cells[0]).toEqual(["", "売上", "原価"]);
    expect(cells[1]).toEqual(["Jan", "100", "60"]);
    expect(cells[2]).toEqual(["Feb", "120", "70"]);
  });

  it("round-trip で kind/categories/series が一致し title/options を引き継ぐ", () => {
    const cells = chartSpecToCells(spec);
    const back = cellsToChartSpec(cells, "line", spec);
    expect(back.kind).toBe("line");
    expect(back.categories).toEqual(["Jan", "Feb"]);
    expect(back.series.map((s) => s.name)).toEqual(["売上", "原価"]);
    expect(back.series[0].values).toEqual([100, 120]);
    expect(back.title).toBe("売上");
    expect(back.options).toEqual({ legend: "near-line" });
  });

  it("欠損(null)は空セル、空セルは null に戻る", () => {
    const withGap: ChartSpec = {
      kind: "bar",
      categories: ["a", "b"],
      series: [{ name: "x", values: [null, 5] }],
    };
    const cells = chartSpecToCells(withGap);
    expect(cells[1]).toEqual(["a", ""]);
    const back = cellsToChartSpec(cells, "bar", withGap);
    expect(back.series[0].values).toEqual([null, 5]);
  });
});

describe("chartSpecToCells / cellsToChartSpec — scatter", () => {
  const spec: ChartSpec = {
    kind: "scatter",
    title: "相関",
    series: [
      { name: "A", points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] },
      { name: "B", points: [{ x: 5, y: 6 }] },
    ],
  };

  it("spec→cells は系列ごと x,y 2列", () => {
    const cells = chartSpecToCells(spec);
    expect(cells[0]).toEqual(["A x", "A y", "B x", "B y"]);
    expect(cells[1]).toEqual(["1", "2", "5", "6"]);
    expect(cells[2]).toEqual(["3", "4", "", ""]);
  });

  it("round-trip で series/points が一致", () => {
    const cells = chartSpecToCells(spec);
    const back = cellsToChartSpec(cells, "scatter", spec);
    expect(back.kind).toBe("scatter");
    expect(back.series.map((s) => s.name)).toEqual(["A", "B"]);
    expect(back.series[0].points).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4 }]);
    expect(back.series[1].points).toEqual([{ x: 5, y: 6 }]);
    expect(back.title).toBe("相関");
  });
});
