import { computeCollapsedRegions, type CollapseRegion, type DiffLine } from "../utils/diffEngine";

// アライン済み DiffLine 配列を簡潔に生成するヘルパー。
// "e" = equal（未変更）, "c" = changed（変更: ここでは modified-new 扱い）
function makeLines(spec: string): DiffLine[] {
  return spec.split("").map((ch, i) => ({
    text: `line${i}`,
    type: ch === "e" ? "equal" : "modified-new",
    blockId: ch === "e" ? null : 0,
    lineNumber: i + 1,
  }));
}

function kinds(regions: CollapseRegion[]): string {
  return regions.map((r) => (r.kind === "visible" ? `v[${r.startIdx},${r.endIdx})` : `c[${r.startIdx},${r.endIdx})x${r.collapsedCount}`)).join(" ");
}

describe("computeCollapsedRegions", () => {
  test("空配列 → 空", () => {
    expect(computeCollapsedRegions([], 3)).toEqual([]);
  });

  test("変更なし（全 equal）→ 全体を1つの collapsed", () => {
    const lines = makeLines("eeeeeeeeee"); // 10 行
    const regions = computeCollapsedRegions(lines, 3);
    expect(regions).toHaveLength(1);
    expect(regions[0]).toEqual({ kind: "collapsed", startIdx: 0, endIdx: 10, collapsedCount: 10 });
  });

  test("中央に1変更、context=3 → collapsed / visible / collapsed", () => {
    // index 0..9 equal, 10 changed, 11..20 equal (len 21)
    const lines = makeLines("eeeeeeeeeeceeeeeeeeee");
    const regions = computeCollapsedRegions(lines, 3);
    // visible は 7..13（変更10の前後3行）
    expect(kinds(regions)).toBe("c[0,7)x7 v[7,14) c[14,21)x7");
  });

  test("context=0 → 変更行のみ visible、残りは collapsed", () => {
    const lines = makeLines("eeeceee"); // 変更は index 3
    const regions = computeCollapsedRegions(lines, 0);
    expect(kinds(regions)).toBe("c[0,3)x3 v[3,4) c[4,7)x3");
  });

  test("変更が先頭付近（context 内）→ 先頭は collapsed されない", () => {
    const lines = makeLines("ceeeeeeeee"); // 変更 index 0, len 10
    const regions = computeCollapsedRegions(lines, 3);
    // visible 0..3、collapsed 4..9
    expect(kinds(regions)).toBe("v[0,4) c[4,10)x6");
  });

  test("近接した2変更（ギャップ < 2*context）はギャップも visible", () => {
    // 変更 index 5 と 9、間の 6,7,8 は両方の context に入る
    const lines = makeLines("eeeeeceeeceeeee"); // len 15
    const regions = computeCollapsedRegions(lines, 3);
    // 変更5→visible 2..8, 変更9→visible 6..12 → 統合で 2..12（exclusive 13）
    expect(kinds(regions)).toBe("c[0,2)x2 v[2,13) c[13,15)x2");
  });

  test("1行だけの未変更ラン（< MIN_COLLAPSE）は collapsed せず visible", () => {
    // context=0 で変更を 0 と 2 に置くと index1 の equal ランが長さ1
    const lines = makeLines("cec"); // len 3
    const regions = computeCollapsedRegions(lines, 0);
    // index1 の equal は長さ1なので畳まず全体 visible
    expect(kinds(regions)).toBe("v[0,3)");
  });

  test("expandedStarts 指定で該当 collapsed を visible 化し隣接を統合", () => {
    const lines = makeLines("eeeeeeeeeeceeeeeeeeee"); // 前テストと同じ len 21
    // 先頭 collapsed の startIdx=0 を展開
    const regions = computeCollapsedRegions(lines, 3, new Set([0]));
    // c[0,7) が visible 化し v[7,14) と統合 → v[0,14) c[14,21)
    expect(kinds(regions)).toBe("v[0,14) c[14,21)x7");
  });

  test("collapsed の collapsedCount は隠す行数と一致", () => {
    const lines = makeLines("eeeeeeeeeeceeeeeeeeee");
    const regions = computeCollapsedRegions(lines, 3);
    const collapsed = regions.filter((r) => r.kind === "collapsed");
    for (const r of collapsed) {
      expect(r.collapsedCount).toBe(r.endIdx - r.startIdx);
    }
  });
});
