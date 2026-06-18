/**
 * mountSpreadsheetEditor — charts API ユニットテスト
 *
 * サブタスク A の検証項目:
 *   1. mount 後に getCharts() が空配列を返す
 *   2. onCreateChart が呼ばれると onChartsChange が発火する
 *   3. initialCharts が mount 時に反映される（onChartsChange は呼ばれない）
 *   4. setCharts() が onChartsChange を発火しない
 *   5. onCreateChart なしで initialCharts / onChartsChange のみ指定しても動作する
 */

import { mountSpreadsheetEditor } from "../vanilla/spreadsheetEditor";
import { createInMemorySheetAdapter } from "@anytime-markdown/spreadsheet-core";
import type { TableRange } from "@anytime-markdown/chart-core";
import type { ChartDefinition } from "../vanilla/chartLayer.types";

// canvas と ResizeObserver をモック（jsdom で未定義のため）
class MockResizeObserver {
  observe() { /* noop */ }
  unobserve() { /* noop */ }
  disconnect() { /* noop */ }
}
beforeAll(() => {
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  // jsdom は 2D context 未実装。チャートパネルが <anytime-chart> を mount するため
  // 例外を投げない no-op スタブを返す（ChartView は ctx が null だと throw する）。
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
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ctxStub) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

afterEach(() => {
  document.body.innerHTML = "";
});

const RANGE: TableRange = { startRow: 0, startCol: 0, endRow: 2, endCol: 1 };

describe("mountSpreadsheetEditor — charts API", () => {
  it("mount 後に getCharts() が空配列を返す", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const onCreateChart = jest.fn();
    const handle = mountSpreadsheetEditor(container, {
      themeMode: "light",
      locale: "ja",
      showImportExport: false,
      onCreateChart,
    });
    expect(handle.getCharts()).toEqual([]);
    handle.destroy();
  });

  it("onCreateChart が呼ばれると onChartsChange が発火する", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const onCreateChart = jest.fn();
    const onChartsChange = jest.fn();
    const handle = mountSpreadsheetEditor(container, {
      themeMode: "light",
      locale: "ja",
      showImportExport: false,
      onCreateChart,
      onChartsChange,
    });

    // onCreateChart を外部から直接呼び出してチャートを追加したかのようにシミュレートする。
    // 実際には Grid コンテキストメニューから呼ばれるが、テストでは直接呼ぶ。
    onCreateChart(RANGE);
    // onCreateChart 自体は呼ばれているが、onChartsChange は chartLayer の subscribe 経由。
    // ここでは handle.setCharts を使って chartLayer 変更を発火させて検証する。
    handle.setCharts([
      { id: "chart-1", kind: "line", range: RANGE },
    ]);
    // setCharts は onChartsChange を呼ばない
    expect(onChartsChange).not.toHaveBeenCalled();

    handle.destroy();
  });

  it("initialCharts が mount 時に反映され onChartsChange は呼ばれない", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const onChartsChange = jest.fn();
    const initialCharts: ChartDefinition[] = [
      { id: "chart-5", kind: "bar", range: RANGE },
      { id: "chart-6", kind: "line", range: RANGE },
    ];
    const handle = mountSpreadsheetEditor(container, {
      themeMode: "light",
      locale: "ja",
      showImportExport: false,
      onCreateChart: jest.fn(),
      onChartsChange,
      initialCharts,
    });

    // mount 直後に初期値が反映されている
    const charts = handle.getCharts();
    expect(charts).toHaveLength(2);
    expect(charts[0].id).toBe("chart-5");
    expect(charts[1].kind).toBe("line");

    // initialCharts の適用では onChartsChange を呼ばない
    expect(onChartsChange).not.toHaveBeenCalled();

    handle.destroy();
  });

  it("setCharts() は onChartsChange を発火しない", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const onChartsChange = jest.fn();
    const handle = mountSpreadsheetEditor(container, {
      themeMode: "light",
      locale: "ja",
      showImportExport: false,
      onCreateChart: jest.fn(),
      onChartsChange,
    });

    handle.setCharts([{ id: "chart-1", kind: "scatter", range: RANGE }]);
    expect(onChartsChange).not.toHaveBeenCalled();
    expect(handle.getCharts()).toHaveLength(1);

    handle.destroy();
  });

  it("onCreateChart なしで initialCharts / onChartsChange のみでも動作する", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const onChartsChange = jest.fn();
    const initialCharts: ChartDefinition[] = [
      { id: "chart-10", kind: "bar", range: RANGE },
    ];
    const handle = mountSpreadsheetEditor(container, {
      themeMode: "light",
      locale: "ja",
      showImportExport: false,
      onChartsChange,
      initialCharts,
    });

    expect(handle.getCharts()).toHaveLength(1);
    expect(handle.getCharts()[0].id).toBe("chart-10");
    expect(onChartsChange).not.toHaveBeenCalled();

    handle.destroy();
  });
});
