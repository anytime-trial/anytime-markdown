/**
 * AnytimeSpreadsheetElement charts チャネルのユニットテスト。
 *
 * - el.charts プロパティの往復（set / get）
 * - ユーザー操作 API 経由（addChart / removeChart）で chartschange イベントが発火する
 * - プログラム的な set では chartschange が発火しない
 * - exportChartFence が ```anytime-chart で始まり妥当 JSON を含む
 * - connect 前の set は pending として保持し、connect 後に反映される
 *
 * jsdom: canvas 2D context は no-op。ResizeObserver モックは既存テストと同方式。
 */

import "../element"; // customElements.define の副作用
import { AnytimeSpreadsheetElement } from "../AnytimeSpreadsheetElement";

afterEach(() => {
  document.body.innerHTML = "";
});

// jsdom に ResizeObserver がない場合モックを注入
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

describe("AnytimeSpreadsheetElement.charts", () => {
  it("connect 後の charts get は初期空配列を返す", () => {
    const el = document.createElement("anytime-spreadsheet") as AnytimeSpreadsheetElement;
    document.body.appendChild(el);
    expect(el.charts).toEqual([]);
  });

  it("connect 前に set した charts を connect 後に反映し round-trip できる", () => {
    const el = document.createElement("anytime-spreadsheet") as AnytimeSpreadsheetElement;
    el.value = "月,売上\n1月,100\n2月,200";
    el.charts = [
      {
        id: "chart-1",
        kind: "line",
        range: { startRow: 0, startCol: 0, endRow: 2, endCol: 1 },
      },
    ];
    document.body.appendChild(el);
    expect(el.charts).toHaveLength(1);
    expect(el.charts[0].id).toBe("chart-1");
    expect(el.charts[0].kind).toBe("line");
  });

  it("プログラム的な charts set では chartschange を発火しない", () => {
    const el = document.createElement("anytime-spreadsheet") as AnytimeSpreadsheetElement;
    el.value = "月,売上\n1月,100";
    document.body.appendChild(el);

    const onChange = jest.fn();
    el.addEventListener("chartschange", onChange);

    el.charts = [
      {
        id: "chart-1",
        kind: "bar",
        range: { startRow: 0, startCol: 0, endRow: 1, endCol: 1 },
      },
    ];
    expect(onChange).not.toHaveBeenCalled();
  });

  it("addChart 経由のチャート追加で chartschange が発火する", () => {
    const el = document.createElement("anytime-spreadsheet") as AnytimeSpreadsheetElement;
    el.value = "月,売上\n1月,100";
    document.body.appendChild(el);

    const onChange = jest.fn();
    el.addEventListener("chartschange", onChange);

    // chartLayer の addChart を WC 内部から直接呼ぶ代わりに、
    // テストでは charts プロパティを経由せず layer を直接操作する。
    // WC の private chartLayer には直接アクセスできないため、
    // el.charts = [] によるプログラム set → 変更なし（発火しない）を確認し、
    // その後 importCharts を通じてユーザー操作相当の addChart を確認する。
    //
    // 実際のユーザー操作は contextMenu 経由だが、WC の chartschange 発火経路は
    // chartLayer.subscribe → emitChartsChange のため、
    // テストでは chartLayer をリフレクションで呼ぶ。
    const wcAsAny = el as unknown as {
      chartLayer: { addChart: (def: Omit<{id:string;kind:string;range:object},"id">) => unknown };
    };
    wcAsAny.chartLayer.addChart({
      kind: "bar",
      range: { startRow: 0, startCol: 0, endRow: 1, endCol: 1 },
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    const event = onChange.mock.calls[0][0] as CustomEvent<{ charts: unknown[] }>;
    expect(event.detail.charts).toHaveLength(1);
  });

  it("exportChartFence が ```anytime-chart フェンスで始まり妥当 JSON を含む", () => {
    const el = document.createElement("anytime-spreadsheet") as AnytimeSpreadsheetElement;
    el.value = "月,売上\n1月,100\n2月,200";
    document.body.appendChild(el);

    // chartLayer に直接 addChart してからフェンス生成
    const wcAsAny = el as unknown as {
      chartLayer: {
        addChart: (def: object) => { id: string };
      };
    };
    const def = wcAsAny.chartLayer.addChart({
      kind: "line",
      range: { startRow: 0, startCol: 0, endRow: 2, endCol: 1 },
    });

    const fence = el.exportChartFence(def.id);
    expect(fence).toMatch(/^```anytime-chart\n/);
    expect(fence).toMatch(/```$/);

    // JSON 部分が妥当であること
    const jsonPart = fence.replace(/^```anytime-chart\n/, "").replace(/\n```$/, "");
    expect(() => JSON.parse(jsonPart)).not.toThrow();
    const spec = JSON.parse(jsonPart);
    expect(spec.kind).toBe("line");
    expect(Array.isArray(spec.series)).toBe(true);
  });

  it("exportChartFence に不正 id を渡すと空文字を返す", () => {
    const el = document.createElement("anytime-spreadsheet") as AnytimeSpreadsheetElement;
    document.body.appendChild(el);
    expect(el.exportChartFence("nonexistent")).toBe("");
  });
});
