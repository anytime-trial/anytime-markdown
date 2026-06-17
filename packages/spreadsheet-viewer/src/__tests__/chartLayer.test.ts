/**
 * chartLayer ユニットテスト
 *
 * fromTable を内部で呼ぶため @anytime-markdown/chart-core の実装を使う。
 * createMockAdapter で adapter を差し替えることでセル変更の伝播も検証する。
 */

import type { SheetSnapshot } from "@anytime-markdown/spreadsheet-core";
import { createChartLayer } from "../vanilla/chartLayer";
import { createMockAdapter } from "./support/createMockAdapter";

function makeSnapshot(cells: string[][]): SheetSnapshot {
  return {
    cells,
    alignments: cells.map((row) => row.map(() => null)),
    range: { rows: cells.length, cols: cells[0]?.length ?? 0 },
  };
}

const SIMPLE_CELLS = [
  ["月", "売上"],
  ["1月", "100"],
  ["2月", "200"],
];

describe("chartLayer", () => {
  it("addChart → getCharts で 1 件取得できる", () => {
    const adapter = createMockAdapter(makeSnapshot(SIMPLE_CELLS));
    const layer = createChartLayer(adapter);

    const def = layer.addChart({
      kind: "line",
      range: { startRow: 0, startCol: 0, endRow: 2, endCol: 1 },
    });

    expect(def.id).toBe("chart-1");
    const charts = layer.getCharts();
    expect(charts).toHaveLength(1);
    expect(charts[0].id).toBe("chart-1");
    expect(charts[0].kind).toBe("line");

    layer.destroy();
  });

  it("getSpec が fromTable 由来の ChartSpec を返す", () => {
    const adapter = createMockAdapter(makeSnapshot(SIMPLE_CELLS));
    const layer = createChartLayer(adapter);

    const def = layer.addChart({
      kind: "line",
      range: { startRow: 0, startCol: 0, endRow: 2, endCol: 1 },
    });

    const spec = layer.getSpec(def.id);
    expect(spec).not.toBeNull();
    expect(spec?.kind).toBe("line");
    // headerRow=true なので categories は ["1月","2月"]
    expect(spec?.categories).toEqual(["1月", "2月"]);
    // series が 1本（「売上」列）
    expect(spec?.series).toHaveLength(1);
    expect(spec?.series[0].name).toBe("売上");
    expect(spec?.series[0].values).toEqual([100, 200]);

    layer.destroy();
  });

  it("adapter のセル変更後に getSpec が新しい値を反映する", () => {
    const adapter = createMockAdapter(makeSnapshot(SIMPLE_CELLS));
    const layer = createChartLayer(adapter);

    const def = layer.addChart({
      kind: "line",
      range: { startRow: 0, startCol: 0, endRow: 2, endCol: 1 },
    });

    // セルを変更して adapter 経由で snapshot を更新
    adapter.setCell(1, 1, "999");

    const spec = layer.getSpec(def.id);
    expect(spec?.series[0].values?.[0]).toBe(999);

    layer.destroy();
  });

  it("removeChart で指定 id のチャートが削除される", () => {
    const adapter = createMockAdapter(makeSnapshot(SIMPLE_CELLS));
    const layer = createChartLayer(adapter);

    const def1 = layer.addChart({
      kind: "bar",
      range: { startRow: 0, startCol: 0, endRow: 2, endCol: 1 },
    });
    layer.addChart({
      kind: "line",
      range: { startRow: 0, startCol: 0, endRow: 2, endCol: 1 },
    });

    expect(layer.getCharts()).toHaveLength(2);
    layer.removeChart(def1.id);
    expect(layer.getCharts()).toHaveLength(1);
    expect(layer.getCharts()[0].id).toBe("chart-2");

    layer.destroy();
  });

  it("存在しない id の getSpec は null を返す", () => {
    const adapter = createMockAdapter(makeSnapshot(SIMPLE_CELLS));
    const layer = createChartLayer(adapter);
    expect(layer.getSpec("nonexistent")).toBeNull();
    layer.destroy();
  });

  it("subscribe が adapter のセル変更で発火する", () => {
    const adapter = createMockAdapter(makeSnapshot(SIMPLE_CELLS));
    const layer = createChartLayer(adapter);

    const cb = jest.fn();
    const unsub = layer.subscribe(cb);

    // adapter 経由のセル変更
    adapter.setCell(1, 1, "500");
    expect(cb).toHaveBeenCalledTimes(1);

    unsub();
    adapter.setCell(2, 1, "600");
    // unsubscribe 後は呼ばれない
    expect(cb).toHaveBeenCalledTimes(1);

    layer.destroy();
  });

  it("subscribe が addChart で発火する", () => {
    const adapter = createMockAdapter(makeSnapshot(SIMPLE_CELLS));
    const layer = createChartLayer(adapter);

    const cb = jest.fn();
    layer.subscribe(cb);

    layer.addChart({
      kind: "bar",
      range: { startRow: 0, startCol: 0, endRow: 2, endCol: 1 },
    });
    expect(cb).toHaveBeenCalledTimes(1);

    layer.destroy();
  });

  it("setCharts で charts を一括置換できる", () => {
    const adapter = createMockAdapter(makeSnapshot(SIMPLE_CELLS));
    const layer = createChartLayer(adapter);

    layer.setCharts([
      { id: "chart-10", kind: "bar", range: { startRow: 0, startCol: 0, endRow: 2, endCol: 1 } },
      { id: "chart-20", kind: "line", range: { startRow: 0, startCol: 0, endRow: 2, endCol: 1 } },
    ]);
    expect(layer.getCharts()).toHaveLength(2);

    // setCharts 後に addChart すると counter が最大値を超える id になる
    const def = layer.addChart({
      kind: "scatter",
      range: { startRow: 0, startCol: 0, endRow: 2, endCol: 1 },
    });
    // counter は 20 になっているので次は 21
    expect(def.id).toBe("chart-21");

    layer.destroy();
  });
});
