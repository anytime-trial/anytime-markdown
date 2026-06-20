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

  it("左右2軸: right 系列は右スケール（左軸と別位置）で配置される", () => {
    // 左系列は大きい値域、右系列は小さい値域 → 同じ値でも y 位置が異なる
    const spec: ChartSpec = {
      kind: "combo",
      categories: ["Jan", "Feb"],
      series: [
        { name: "売上", type: "bar", axis: "left", values: [1000, 1000] },
        { name: "達成率", type: "line", axis: "right", values: [50, 50] },
      ],
    };
    const layout = renderChart(ctxStub(), rect, spec, theme);
    const leftPt = layout.points.find((p) => p.seriesIndex === 0);
    const rightPt = layout.points.find((p) => p.seriesIndex === 1);
    expect(leftPt && rightPt).toBeTruthy();
    // 左軸 1000(max付近=上) と 右軸 50(右軸 max=50 付近=上) は別スケール。
    // 右系列 50 は右軸の最大付近 → 上端寄り。左系列 1000 も左軸最大付近 → 上端寄り。
    // ここでは「右系列の点 y が右スケール由来」を、右軸 max=50 のとき y≈plot top に来ることで確認。
    expect(rightPt!.cy).toBeLessThan(rect.height / 2);
  });

  it("右軸系列なしなら従来の単一軸（例外なし）", () => {
    const spec: ChartSpec = {
      kind: "line",
      categories: ["a", "b"],
      series: [{ name: "A", values: [1, 2] }],
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

  it("pie は軸マージンを使わず矩形幅いっぱいに中心配置する", () => {
    const spec: ChartSpec = {
      kind: "pie",
      categories: ["A", "B"],
      series: [{ name: "x", values: [1, 1] }],
    };
    const layout = renderChart(ctxStub(), rect, spec, theme);
    // 軸 plot（左56+右余白で width<320）ではなく、ほぼ全幅(400-16=384)を使う
    expect(layout.plotRect.width).toBeGreaterThan(360);
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

  it("yAxis.label / yAxisRight.label を spec に保持し例外を投げない", () => {
    const spec: ChartSpec = {
      kind: "line",
      categories: ["A", "B"],
      series: [
        { name: "left", axis: "left", values: [1, 2] },
        { name: "right", axis: "right", values: [10, 20] },
      ],
      options: { yAxis: { label: "件数" }, yAxisRight: { label: "%" } },
    };
    const layout = renderChart(ctxStub(), rect, spec, theme);
    expect(layout.spec.options?.yAxis?.label).toBe("件数");
    expect(layout.spec.options?.yAxisRight?.label).toBe("%");
    // ラベルぶん左余白が広がる（プロット幅は素のときより狭い）
    const bare = renderChart(ctxStub(), rect, { ...spec, options: {} }, theme);
    expect(layout.plotRect.width).toBeLessThan(bare.plotRect.width);
  });

  it("combo + options.stacked は棒を積み上げ、line を重ねる", () => {
    const spec: ChartSpec = {
      kind: "combo",
      categories: ["Jan", "Feb"],
      series: [
        { name: "A", type: "bar", values: [1, 2] },
        { name: "B", type: "bar", values: [3, 4] },
        { name: "C", type: "line", values: [5, 6] },
      ],
      options: { stacked: true },
    };
    const layout = renderChart(ctxStub(), rect, spec, theme);
    expect(layout.points).toHaveLength(6); // bar 2系列×2カテゴリ(4) + line 2
    // 積み上げ: 同カテゴリの2棒は別 y（B が A の上に乗る）
    const a0 = layout.points.find((p) => p.seriesIndex === 0 && p.dataIndex === 0)!;
    const b0 = layout.points.find((p) => p.seriesIndex === 1 && p.dataIndex === 0)!;
    expect(b0.cy).toBeLessThan(a0.cy); // B(上)の top は A(下)の top より上
  });

  it("combo は bar + area + line の3系列を描く", () => {
    const spec: ChartSpec = {
      kind: "combo",
      categories: ["A", "B"],
      series: [
        { name: "Sales", type: "bar", values: [10, 20] },
        { name: "Cum", type: "area", values: [5, 8] },
        { name: "Target", type: "line", values: [15, 25] },
      ],
    };
    const layout = renderChart(ctxStub(), rect, spec, theme);
    expect(layout.points).toHaveLength(6); // 2 bar + 2 area + 2 line
    // area 系列の点は元インデックス1で引ける
    expect(layout.points.some((p) => p.seriesIndex === 1)).toBe(true);
  });

  it("markers を spec に保持し、描画でクラッシュしない", () => {
    const spec: ChartSpec = {
      kind: "line",
      categories: ["Jan", "Feb", "Mar"],
      series: [{ name: "A", values: [1, 2, 3] }],
      markers: [
        { xIndex: 1, label: "v1.0", style: "line", color: "#f00" },
        { xIndex: 2, style: "point" },
      ],
    };
    const layout = renderChart(ctxStub(), rect, spec, theme);
    expect(layout.spec.markers).toHaveLength(2);
    expect(layout.points).toHaveLength(3); // マーカーは系列点に影響しない
  });
});
