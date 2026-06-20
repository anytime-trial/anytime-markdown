import type { ChartKind, ChartOptions, TableRange } from "@anytime-markdown/chart-core";

export type { ChartKind, TableRange };

/**
 * スプレッドシート上のチャート定義。
 * id は連番カウンタで決定論的に採番（Math.random / Date.now 禁止）。
 */
export interface ChartDefinition {
  readonly id: string;
  readonly kind: ChartKind;
  readonly range: TableRange;
  readonly options?: ChartOptions;
}
