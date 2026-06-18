// markdown-rich の jest は bare `@anytime-markdown/markdown-viewer` をシムに解決するため、
// 実データ ANYTIME_CHART_SAMPLES は subpath import（moduleNameMapper で worktree src へ）で取得する。
import { ANYTIME_CHART_SAMPLES } from "@anytime-markdown/markdown-viewer/src/constants/samples";
import { renderChart, getChartTheme, type ChartSpec } from "@anytime-markdown/chart-core";

/** jsdom には 2D context が無いため no-op スタブを使う（renderChart 契約検証用）。 */
function ctxStub(): CanvasRenderingContext2D {
  const noop = () => {};
  return new Proxy(
    {},
    {
      get: (_t, p) => {
        if (p === "measureText") return () => ({ width: 10 });
        if (p === "canvas") return { width: 400, height: 300 };
        return noop;
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
}

describe("ANYTIME_CHART_SAMPLES", () => {
  it("line / bar / area / pie / scatter を含むサンプルを持つ", () => {
    expect(ANYTIME_CHART_SAMPLES.length).toBeGreaterThanOrEqual(5);
    const kinds = ANYTIME_CHART_SAMPLES.map((s) => (JSON.parse(s.code) as ChartSpec).kind);
    expect(kinds).toContain("line");
    expect(kinds).toContain("bar");
    expect(kinds).toContain("area");
    expect(kinds).toContain("pie");
    expect(kinds).toContain("scatter");
  });

  it("ドーナツ（pie + options.donut）サンプルを持つ", () => {
    const hasDonut = ANYTIME_CHART_SAMPLES.some((s) => {
      const spec = JSON.parse(s.code) as ChartSpec;
      return spec.kind === "pie" && spec.options?.donut === true;
    });
    expect(hasDonut).toBe(true);
  });

  it("各サンプルは label / i18nKey / code を持つ", () => {
    for (const s of ANYTIME_CHART_SAMPLES) {
      expect(typeof s.label).toBe("string");
      expect(s.i18nKey.length).toBeGreaterThan(0);
      expect(s.code.length).toBeGreaterThan(0);
    }
  });

  it("全サンプルの code が妥当な ChartSpec JSON で chart-core が例外なく描画できる", () => {
    const theme = getChartTheme("light");
    const rect = { x: 0, y: 0, width: 400, height: 300 };
    for (const s of ANYTIME_CHART_SAMPLES) {
      const spec = JSON.parse(s.code) as ChartSpec;
      expect(Array.isArray(spec.series)).toBe(true);
      expect(() => renderChart(ctxStub(), rect, spec, theme)).not.toThrow();
    }
  });
});
