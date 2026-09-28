import {
  type A11yBaseline,
  type A11yScanResult,
  formatRatchetReport,
  ratchetA11y,
  seedBaselineForNewPages,
} from "../../a11y/ratchet";

const scan = (page: string, violations: Array<[string, number, string | null]>): A11yScanResult => ({
  page,
  violations: violations.map(([id, nodes, impact]) => ({ id, nodes, impact })),
});

describe("ratchetA11y", () => {
  it("基線に無い違反は回帰として報告する", () => {
    const result = ratchetA11y({}, [scan("/", [["color-contrast", 2, "serious"]])]);
    expect(result.regressions).toEqual([
      { page: "/", id: "color-contrast", impact: "serious", nodes: 2, allowed: 0 },
    ]);
    expect(result.improvements).toEqual([]);
    expect(result.ok).toBe(false);
  });

  it("基線以内の違反は通し、減った分を改善として報告する", () => {
    const baseline: A11yBaseline = { "/": { "color-contrast": 3, "image-alt": 1 } };
    const result = ratchetA11y(baseline, [scan("/", [["color-contrast", 3, "serious"]])]);
    expect(result.regressions).toEqual([]);
    expect(result.improvements).toEqual([{ page: "/", id: "image-alt", nodes: 0, allowed: 1 }]);
    expect(result.ok).toBe(true);
  });

  it("基線を超えた違反は回帰で、超過ノード数ではなく実ノード数を報告する", () => {
    const baseline: A11yBaseline = { "/": { "color-contrast": 1 } };
    const result = ratchetA11y(baseline, [scan("/", [["color-contrast", 4, "serious"]])]);
    expect(result.regressions).toEqual([
      { page: "/", id: "color-contrast", impact: "serious", nodes: 4, allowed: 1 },
    ]);
  });

  it("次の基線は現状と基線の小さい方を取り、0 件のルールと空ページを落とす", () => {
    const baseline: A11yBaseline = { "/": { "color-contrast": 3, "image-alt": 1 }, "/old": { label: 1 } };
    const result = ratchetA11y(baseline, [
      scan("/", [["color-contrast", 2, "serious"], ["link-name", 5, "serious"]]),
      scan("/new", []),
    ]);
    // 回帰（link-name）は次の基線に取り込まない（基線を手で増やさない原則）
    expect(result.nextBaseline).toEqual({ "/": { "color-contrast": 2 }, "/old": { label: 1 } });
  });

  it("走査しなかったページの基線はそのまま残す", () => {
    const baseline: A11yBaseline = { "/unscanned": { label: 2 } };
    const result = ratchetA11y(baseline, [scan("/", [])]);
    expect(result.ok).toBe(true);
    expect(result.nextBaseline).toEqual({ "/unscanned": { label: 2 } });
  });

  it("ページとルールの出力順は安定している（ページ→ルール名の辞書順）", () => {
    const result = ratchetA11y({}, [
      scan("/b", [["zeta", 1, null], ["alpha", 1, null]]),
      scan("/a", [["m", 1, "minor"]]),
    ]);
    expect(result.regressions.map((r) => `${r.page}:${r.id}`)).toEqual(["/a:m", "/b:alpha", "/b:zeta"]);
  });
});

describe("formatRatchetReport", () => {
  it("回帰と改善を 1 行ずつ、無ければ clean と出す", () => {
    const result = ratchetA11y({ "/": { "image-alt": 1 } }, [scan("/", [["color-contrast", 2, "serious"]])]);
    const text = formatRatchetReport(result);
    expect(text).toContain("regressions: 1");
    expect(text).toContain("- / color-contrast (serious): 2 nodes, allowed 0");
    expect(text).toContain("improvements: 1");
    expect(text).toContain("- / image-alt: 0 nodes, allowed 1");
    expect(formatRatchetReport(ratchetA11y({}, [scan("/", [])]))).toContain("clean");
  });
});

describe("seedBaselineForNewPages", () => {
  it("基線に無いページだけ現状を取り込み、既存ページは触らない", () => {
    const baseline: A11yBaseline = { "/": { "image-alt": 1 } };
    const seeded = seedBaselineForNewPages(baseline, [
      scan("/", [["image-alt", 5, "critical"]]),
      scan("/new", [["color-contrast", 2, "serious"], ["empty", 0, null]]),
      scan("/clean", []),
    ]);
    expect(seeded).toEqual({ "/": { "image-alt": 1 }, "/new": { "color-contrast": 2 } });
  });
});
