import { fromTable } from "../data/fromTable";

const cells = [
  ["月", "売上", "原価"],
  ["Jan", "100", "60"],
  ["Feb", "120", "70"],
];

describe("fromTable", () => {
  it("先頭行ヘッダ・先頭列カテゴリで line spec を作る", () => {
    const spec = fromTable(
      cells,
      { startRow: 0, startCol: 0, endRow: 2, endCol: 2 },
      { kind: "line", headerRow: true, categoryCol: 0, orientation: "columns" },
    );
    expect(spec.kind).toBe("line");
    expect(spec.categories).toEqual(["Jan", "Feb"]);
    expect(spec.series.map((s) => s.name)).toEqual(["売上", "原価"]);
    expect(spec.series[0].values).toEqual([100, 120]);
    expect(spec.series[1].values).toEqual([60, 70]);
  });

  it("カンマ区切り数値をパースし、非数値は null にする", () => {
    const spec = fromTable(
      [["q", "v"], ["A", "1,500"], ["B", "n/a"]],
      { startRow: 0, startCol: 0, endRow: 2, endCol: 1 },
      { kind: "bar", headerRow: true, categoryCol: 0 },
    );
    expect(spec.series[0].values).toEqual([1500, null]);
  });

  it("scatter は最初の2列を x,y にする", () => {
    const spec = fromTable(
      [["x", "y"], ["1", "2"], ["3", "4"]],
      { startRow: 0, startCol: 0, endRow: 2, endCol: 1 },
      { kind: "scatter", headerRow: true },
    );
    expect(spec.series[0].points).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
  });

  it("scatter は数値化できない行を除外する", () => {
    const spec = fromTable(
      [["x", "y"], ["1", "2"], ["bad", "4"]],
      { startRow: 0, startCol: 0, endRow: 2, endCol: 1 },
      { kind: "scatter", headerRow: true },
    );
    expect(spec.series[0].points).toEqual([{ x: 1, y: 2 }]);
  });
});
