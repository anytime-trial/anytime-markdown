// markdown-rich の jest は bare `@anytime-markdown/markdown-viewer` をシムに解決するため、
// 実データ ANYTIME_GRAPH_SAMPLES は subpath import（moduleNameMapper で worktree src へ）で取得する。
import { ANYTIME_GRAPH_SAMPLES } from "@anytime-markdown/markdown-viewer/src/constants/samples";
import { renderThinkingDiagramSvg } from "@anytime-markdown/graph-core";

describe("ANYTIME_GRAPH_SAMPLES", () => {
  it("10 図種のサンプルを持つ", () => {
    expect(ANYTIME_GRAPH_SAMPLES.length).toBe(10);
  });

  it("各サンプルは label / i18nKey / code を持つ", () => {
    for (const s of ANYTIME_GRAPH_SAMPLES) {
      expect(typeof s.label).toBe("string");
      expect(s.i18nKey.length).toBeGreaterThan(0);
      expect(s.code.length).toBeGreaterThan(0);
    }
  });

  it("全サンプルの DSL が graph-core で例外なく SVG 描画できる", () => {
    for (const s of ANYTIME_GRAPH_SAMPLES) {
      expect(() => renderThinkingDiagramSvg(s.code, false)).not.toThrow();
    }
  });

  it("10 種すべての type を網羅する", () => {
    const types = ANYTIME_GRAPH_SAMPLES.map((s) => s.code.split("\n")[0].trim());
    expect(types).toEqual([
      "type: fishbone",
      "type: causal-loop",
      "type: pyramid",
      "type: mindmap",
      "type: double-diamond",
      "type: logic-tree",
      "type: why-chain",
      "type: swot",
      "type: morph-box",
      "type: affinity",
    ]);
  });
});
