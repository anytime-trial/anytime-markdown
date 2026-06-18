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

// jsdom には ResizeObserver も 2D context もない。チャートパネルが <anytime-chart> を
// mount するため、例外を投げない no-op スタブを注入する（ChartView は ctx null で throw）。
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  const ctxStub = new Proxy(
    {},
    {
      get: (_t, p) => {
        if (p === "measureText") return () => ({ width: 10 });
        if (p === "canvas") return { width: 300, height: 200 };
        return () => {};
      },
      set: () => true,
    },
  );
  HTMLCanvasElement.prototype.getContext = (() =>
    ctxStub) as unknown as typeof HTMLCanvasElement.prototype.getContext;
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

  // 注: ユーザー操作（コンテキストメニューのチャート作成）起因で onChartsChange→
  // chartschange が発火することは spreadsheetEditor.charts.test.ts（onCreateChart→
  // onChartsChange）で検証済み。WC はその onChartsChange を chartschange に転送するだけ。
  // チャート状態は単一所有者である mountSpreadsheetEditor の handle に委譲する。

  it("exportChartFence が ```anytime-chart フェンスで始まり妥当 JSON を含む", () => {
    const el = document.createElement("anytime-spreadsheet") as AnytimeSpreadsheetElement;
    el.value = "月,売上\n1月,100\n2月,200";
    document.body.appendChild(el);

    // 公開 API（charts プロパティ）でチャートを設定してからフェンス生成
    el.charts = [
      { id: "chart-1", kind: "line", range: { startRow: 0, startCol: 0, endRow: 2, endCol: 1 } },
    ];

    const fence = el.exportChartFence("chart-1");
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
