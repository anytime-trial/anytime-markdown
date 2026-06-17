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
