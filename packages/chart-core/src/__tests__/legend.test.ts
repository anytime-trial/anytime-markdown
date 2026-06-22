import { layoutBottomLegend } from "../engine/render/legend";
import type { Series } from "../types";

/** measureText を「1 文字 = 20px」で返すスタブ（折返し境界の検証用）。 */
function ctxStub(): CanvasRenderingContext2D {
  const noop = () => {};
  return new Proxy(
    {},
    {
      get: (_t, p) => {
        if (p === "measureText") return (s: string) => ({ width: s.length * 20 });
        return noop;
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
}

const series = (...names: string[]): Series[] => names.map((name) => ({ name }));

describe("layoutBottomLegend", () => {
  it("空 series は行なし", () => {
    expect(layoutBottomLegend(ctxStub(), [], 200)).toEqual([]);
  });

  it("合計幅が availWidth 以内なら 1 行", () => {
    // "AAAA"(4字=80) + marker10 + gap6 = 96。1 項目は 200 に収まる。
    const rows = layoutBottomLegend(ctxStub(), series("AAAA"), 200);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(1);
  });

  it("合計幅が availWidth を超えると複数行に折り返す", () => {
    // 各 96、項目間 gap16。96 + 16 + 96 = 208 > 200 → 2 行。
    const rows = layoutBottomLegend(ctxStub(), series("AAAA", "BBBB"), 200);
    expect(rows).toHaveLength(2);
    expect(rows.flat()).toHaveLength(2); // 項目の取りこぼしなし
  });

  it("単一項目が availWidth を超えてもドロップせず 1 行に置く", () => {
    const rows = layoutBottomLegend(ctxStub(), series("AAAAAAAAAAAAAAAAAAAA"), 50);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(1);
    expect(rows[0][0].name).toBe("AAAAAAAAAAAAAAAAAAAA");
  });
});
