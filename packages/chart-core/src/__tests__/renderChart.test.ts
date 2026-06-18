import { renderChart } from "../engine/renderChart";
import { hitTest } from "../engine/hitTest";
import { getChartTheme } from "../theme";
import type { ChartSpec } from "../types";

/** jsdom には実 2D コンテキストがないため、メソッドを no-op 化したスタブを使う。 */
function ctxStub(): CanvasRenderingContext2D {
  const noop = () => {};
  return new Proxy(
    {},
    {
      get: (_t, p) => {
        if (p === "measureText") return () => ({ width: 10 });
        if (p === "canvas") return { width: 400, height: 300 };
        if (p === "globalAlpha") return 1;
        return noop;
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
}

const rect = { x: 0, y: 0, width: 400, height: 300 };
const theme = getChartTheme("light");

describe("renderChart", () => {
  it("line を描画し全データ点を points に返す", () => {
    const spec: ChartSpec = {
      kind: "line",
      categories: ["Jan", "Feb", "Mar"],
      series: [{ name: "A", values: [1, 2, 3] }],
    };
    const layout = renderChart(ctxStub(), rect, spec, theme);
    expect(layout.points).toHaveLength(3);
    expect(layout.plotRect.width).toBeGreaterThan(0);
  });

  it("line の欠損(null)は点に含めない", () => {
    const spec: ChartSpec = {
      kind: "line",
      categories: ["a", "b", "c"],
      series: [{ name: "A", values: [1, null, 3] }],
    };
    const layout = renderChart(ctxStub(), rect, spec, theme);
    expect(layout.points).toHaveLength(2);
  });

  it("bar の集合グラフは系列×カテゴリぶんの点を返す", () => {
    const spec: ChartSpec = {
      kind: "bar",
      categories: ["x", "y"],
      series: [
        { name: "A", values: [1, 2] },
        { name: "B", values: [3, 4] },
      ],
      options: { grouped: true },
    };
    const layout = renderChart(ctxStub(), rect, spec, theme);
    expect(layout.points).toHaveLength(4);
  });

  it("scatter は points を配置する", () => {
    const spec: ChartSpec = {
      kind: "scatter",
      series: [{ name: "S", points: [{ x: 1, y: 2 }, { x: 3, y: 5 }] }],
    };
    const layout = renderChart(ctxStub(), rect, spec, theme);
    expect(layout.points).toHaveLength(2);
  });

  it("area は系列×カテゴリぶんの点を返す（積み上げ含む）", () => {
    const spec: ChartSpec = {
      kind: "area",
      categories: ["Jan", "Feb", "Mar"],
      series: [
        { name: "A", values: [1, 2, 3] },
        { name: "B", values: [4, 5, 6] },
      ],
      options: { stacked: true },
    };
    const layout = renderChart(ctxStub(), rect, spec, theme);
    expect(layout.points).toHaveLength(6);
  });

  it("横棒 (bar + horizontal) は系列×カテゴリの点を返す", () => {
    const spec: ChartSpec = {
      kind: "bar",
      categories: ["A", "B", "C"],
      series: [{ name: "人口", values: [10, 20, 30] }],
      options: { horizontal: true },
    };
    const layout = renderChart(ctxStub(), rect, spec, theme);
    expect(layout.points).toHaveLength(3);
  });

  it("積み上げ横棒 (horizontal + stacked) でも例外なく描画する", () => {
    const spec: ChartSpec = {
      kind: "bar",
      categories: ["A", "B"],
      series: [
        { name: "X", values: [1, 2] },
        { name: "Y", values: [3, 4] },
      ],
      options: { horizontal: true, stacked: true },
    };
    expect(() => renderChart(ctxStub(), rect, spec, theme)).not.toThrow();
  });

  it("複合 (combo: bar + line) は両系列の点を返す", () => {
    const spec: ChartSpec = {
      kind: "combo",
      categories: ["Jan", "Feb", "Mar"],
      series: [
        { name: "売上", type: "bar", values: [100, 120, 90] },
        { name: "目標", type: "line", values: [110, 110, 110] },
      ],
    };
    const layout = renderChart(ctxStub(), rect, spec, theme);
    // bar 3 点 + line 3 点
    expect(layout.points).toHaveLength(6);
    // hit-test で line 系列(原インデックス1)の点が正しく引ける
    const linePt = layout.points.find((p) => p.seriesIndex === 1);
    expect(linePt).toBeTruthy();
  });

  it("area の欠損(null)は点・マーカーに含めない（実測0と区別）", () => {
    const spec: ChartSpec = {
      kind: "area",
      categories: ["Jan", "Feb", "Mar"],
      series: [{ name: "A", values: [1, null, 3] }],
    };
    const layout = renderChart(ctxStub(), rect, spec, theme);
    expect(layout.points).toHaveLength(2);
  });

  it("pie はスライスぶんの点を返し、0/負値スライスは除外する", () => {
    const spec: ChartSpec = {
      kind: "pie",
      categories: ["A", "B", "C", "D"],
      series: [{ name: "構成", values: [60, 30, 10, 0] }],
    };
    const layout = renderChart(ctxStub(), rect, spec, theme);
    // 0 のスライスは描画されない → 3 点
    expect(layout.points).toHaveLength(3);
  });

  it("pie(donut) でも例外なく描画する", () => {
    const spec: ChartSpec = {
      kind: "pie",
      categories: ["A", "B"],
      series: [{ name: "構成", values: [70, 30] }],
      options: { donut: true },
    };
    expect(() => renderChart(ctxStub(), rect, spec, theme)).not.toThrow();
  });

  it("pie で total<=0 でも例外を投げず点ゼロ", () => {
    const spec: ChartSpec = {
      kind: "pie",
      categories: ["A", "B"],
      series: [{ name: "x", values: [0, 0] }],
    };
    const layout = renderChart(ctxStub(), rect, spec, theme);
    expect(layout.points).toHaveLength(0);
  });

  it("hitTest は近傍点を返し、遠ければ null", () => {
    const spec: ChartSpec = {
      kind: "line",
      categories: ["Jan", "Feb"],
      series: [{ name: "A", values: [10, 20] }],
    };
    const layout = renderChart(ctxStub(), rect, spec, theme);
    const p0 = layout.points[0];
    const hit = hitTest(layout, p0.cx, p0.cy);
    expect(hit?.value).toBe(10);
    expect(hitTest(layout, -999, -999)).toBeNull();
  });

  it("空 spec でも例外を投げない", () => {
    const layout = renderChart(ctxStub(), rect, { kind: "line", series: [] }, theme);
    expect(layout.points).toHaveLength(0);
  });
});
