import { DEFAULT_SLASH_ITEMS } from "../components-vanilla/slashCommandItems";

describe("anytime-graph スラッシュ集約", () => {
  it("anytime-graph 系スラッシュは総称1個のみ", () => {
    const items = DEFAULT_SLASH_ITEMS.filter(
      (i) => i.id === "anytime-graph" || i.id.startsWith("think-"),
    );
    expect(items.map((i) => i.id)).toEqual(["anytime-graph"]);
  });

  it("総称項目は anytimeGraph ラベルと旧図種キーワードを持つ", () => {
    const item = DEFAULT_SLASH_ITEMS.find((i) => i.id === "anytime-graph");
    expect(item).toBeDefined();
    expect(item!.labelKey).toBe("anytimeGraph");
    for (const kw of ["fishbone", "swot", "mindmap", "思考法"]) {
      expect(item!.keywords).toContain(kw);
    }
  });
});
