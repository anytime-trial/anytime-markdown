import { DEFAULT_SLASH_ITEMS } from "../components-vanilla/slashCommandItems";

/** chain() の呼び出しを記録する fluent proxy（slashCommandItems.vanilla.test.ts と同型）。 */
function createChainEditor() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const chain: Record<string | symbol, unknown> = new Proxy(
    {},
    {
      get(_target, prop) {
        return (...args: unknown[]) => {
          calls.push({ method: String(prop), args });
          return chain;
        };
      },
    },
  );
  const editor = { chain: () => chain } as unknown as Parameters<
    (typeof DEFAULT_SLASH_ITEMS)[number]["action"]
  >[0];
  return { editor, calls };
}

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

  it("action は anytime-graph codeBlock を autoEditOpen:true で insertContent する", () => {
    const item = DEFAULT_SLASH_ITEMS.find((i) => i.id === "anytime-graph");
    expect(item).toBeDefined();
    const { editor, calls } = createChainEditor();
    item!.action(editor);

    const insert = calls.find((c) => c.method === "insertContent");
    expect(insert).toBeDefined();
    const arg = insert!.args[0] as {
      type: string;
      attrs: { language: string; autoEditOpen: boolean };
    };
    expect(arg.type).toBe("codeBlock");
    expect(arg.attrs.language).toBe("anytime-graph");
    expect(arg.attrs.autoEditOpen).toBe(true);
  });
});
