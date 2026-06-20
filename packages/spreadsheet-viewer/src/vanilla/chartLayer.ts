import { fromTable } from "@anytime-markdown/chart-core";
import type { ChartSpec, TableMapping } from "@anytime-markdown/chart-core";
import type { SheetAdapter } from "@anytime-markdown/spreadsheet-core";

import type { ChartDefinition } from "./chartLayer.types";

export type { ChartDefinition };

/**
 * chartLayer — スプレッドシートのチャート定義（ChartDefinition のコレクション）を管理する。
 *
 * - ChartDefinition の CRUD（add / remove / getAll / setAll）
 * - adapter のセル変更を購読し、getSpec のライブ更新を伝播する
 * - id は連番カウンタで採番（Math.random / Date.now 禁止）
 */

export interface ChartLayer {
  addChart(def: Omit<ChartDefinition, "id">): ChartDefinition;
  removeChart(id: string): void;
  getCharts(): ChartDefinition[];
  setCharts(defs: ChartDefinition[]): void;
  /** adapter のスナップショットと def から ChartSpec を導出する。id 不正は null。 */
  getSpec(id: string): ChartSpec | null;
  /**
   * チャート定義の変更 + adapter のセル変更で cb を呼ぶ。
   * unsubscribe 関数を返す。
   */
  subscribe(cb: () => void): () => void;
  destroy(): void;
}

/** fromTable に渡す既定マッピング（headerRow=true, orientation=columns, categoryCol=0）。 */
const DEFAULT_MAPPING: Omit<TableMapping, "kind"> = {
  headerRow: true,
  orientation: "columns",
  categoryCol: 0,
};

export function createChartLayer(adapter: SheetAdapter): ChartLayer {
  let charts: ChartDefinition[] = [];
  let counter = 0;
  const listeners = new Set<() => void>();

  const notify = (): void => {
    for (const cb of listeners) cb();
  };

  /** adapter 変更を全 subscriber に伝播する。 */
  const unsubscribeAdapter = adapter.subscribe(() => {
    notify();
  });

  return {
    addChart(def) {
      counter += 1;
      const id = `chart-${counter}`;
      const chart: ChartDefinition = { ...def, id };
      charts = [...charts, chart];
      notify();
      return chart;
    },

    removeChart(id) {
      const prev = charts;
      charts = charts.filter((c) => c.id !== id);
      if (charts.length !== prev.length) notify();
    },

    getCharts() {
      return charts;
    },

    setCharts(defs) {
      charts = [...defs];
      // counter を既存 id の最大番号に追随させて重複防止
      for (const d of defs) {
        const n = Number(d.id.replace(/^chart-/, ""));
        if (Number.isFinite(n) && n > counter) counter = n;
      }
      notify();
    },

    getSpec(id) {
      const def = charts.find((c) => c.id === id);
      if (!def) return null;
      const snapshot = adapter.getSnapshot();
      const mapping: TableMapping = { ...DEFAULT_MAPPING, kind: def.kind };
      try {
        return fromTable(snapshot.cells, def.range, mapping);
      } catch (err) {
        console.error("[chartLayer] getSpec failed", { id, err });
        return null;
      }
    },

    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },

    destroy() {
      unsubscribeAdapter();
      listeners.clear();
    },
  };
}
