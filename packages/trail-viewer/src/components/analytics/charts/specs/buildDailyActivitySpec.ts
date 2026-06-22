import type { ChartSpec, Series } from '@anytime-markdown/chart-core';

/** buildDailyActivitySpec が必要とする 1 日（または週）ぶんの値。 */
export interface DailyActivityRow {
  readonly date: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
  readonly actualCost: number;
  readonly skillCost: number;
  readonly overlayValue: number | null;
}

export interface DailyActivityColors {
  readonly input: string;
  readonly output: string;
  readonly cacheRead: string;
  readonly cacheWrite: string;
  readonly primary: string;
  readonly skill: string;
  readonly overlayPerLoc: string;
}

/**
 * 日次アクティビティを combo ChartSpec に変換する純粋関数。
 * tokens モード=4トークン系列の積み上げ棒、cost モード=2コスト系列の並列棒。
 * overlay（tok/LOC または $/LOC）は常に右軸の折れ線。
 */
export function buildDailyActivitySpec(
  dataset: ReadonlyArray<DailyActivityRow>,
  opts: Readonly<{
    isTokens: boolean;
    hasOverlay: boolean;
    overlayLabel: string;
    colors: DailyActivityColors;
    barLabels: Readonly<{ input: string; output: string; cacheRead: string; cacheWrite: string; current: string; optimized: string }>;
  }>,
): ChartSpec {
  const { colors, barLabels } = opts;
  const categories = dataset.map((d) => d.date);
  const barSeries: Series[] = opts.isTokens
    ? [
        { name: barLabels.input, type: 'bar', color: colors.input, values: dataset.map((d) => d.inputTokens) },
        { name: barLabels.output, type: 'bar', color: colors.output, values: dataset.map((d) => d.outputTokens) },
        { name: barLabels.cacheRead, type: 'bar', color: colors.cacheRead, values: dataset.map((d) => d.cacheReadTokens) },
        { name: barLabels.cacheWrite, type: 'bar', color: colors.cacheWrite, values: dataset.map((d) => d.cacheCreationTokens) },
      ]
    : [
        { name: barLabels.current, type: 'bar', color: colors.primary, values: dataset.map((d) => d.actualCost) },
        { name: barLabels.optimized, type: 'bar', color: colors.skill, values: dataset.map((d) => d.skillCost) },
      ];
  const lineSeries: Series[] = opts.hasOverlay
    ? [
        {
          name: opts.overlayLabel,
          type: 'line',
          axis: 'right',
          color: colors.overlayPerLoc,
          connectNulls: true,
          values: dataset.map((d) => d.overlayValue),
        },
      ]
    : [];
  return {
    kind: 'combo',
    categories,
    series: [...barSeries, ...lineSeries],
    options: {
      stacked: opts.isTokens,
      legend: 'bottom',
      ...(opts.hasOverlay ? { yAxisRight: { label: opts.overlayLabel } } : {}),
    },
  };
}
