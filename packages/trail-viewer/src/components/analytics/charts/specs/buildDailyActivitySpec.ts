import type { ChartSpec, Series } from '@anytime-markdown/chart-core';
import type { DailyViewMode } from '../../types';

/** buildDailyActivitySpec が必要とする 1 日（または週）ぶんの値。 */
export interface DailyActivityRow {
  readonly date: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
  readonly actualCost: number;
  readonly skillCost: number;
  readonly linesAdded: number;
  readonly linesDeleted: number;
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

function buildBarSeries(
  dataset: ReadonlyArray<DailyActivityRow>,
  mode: DailyViewMode,
  colors: DailyActivityColors,
  barLabels: Readonly<{ input: string; output: string; cacheRead: string; cacheWrite: string; current: string; optimized: string; locAdded: string; locDeleted: string }>,
): Series[] {
  if (mode === 'tokens') {
    return [
      { name: barLabels.input, type: 'bar', color: colors.input, values: dataset.map((d) => d.inputTokens) },
      { name: barLabels.output, type: 'bar', color: colors.output, values: dataset.map((d) => d.outputTokens) },
      { name: barLabels.cacheRead, type: 'bar', color: colors.cacheRead, values: dataset.map((d) => d.cacheReadTokens) },
      { name: barLabels.cacheWrite, type: 'bar', color: colors.cacheWrite, values: dataset.map((d) => d.cacheCreationTokens) },
    ];
  }
  if (mode === 'loc') {
    return [
      { name: barLabels.locAdded, type: 'bar', color: colors.cacheRead, values: dataset.map((d) => d.linesAdded) },
      { name: barLabels.locDeleted, type: 'bar', color: colors.output, values: dataset.map((d) => d.linesDeleted) },
    ];
  }
  return [
    { name: barLabels.current, type: 'bar', color: colors.primary, values: dataset.map((d) => d.actualCost) },
    { name: barLabels.optimized, type: 'bar', color: colors.skill, values: dataset.map((d) => d.skillCost) },
  ];
}

/**
 * 日次アクティビティを combo ChartSpec に変換する純粋関数。
 * tokens モード=4トークン系列の積み上げ棒、loc モード=追加/削除 LOC の積み上げ棒、
 * cost モード=2コスト系列の並列棒。
 * overlay（tok/LOC または $/LOC）は右軸の折れ線（loc モードは分母が LOC のため重ねない）。
 */
export function buildDailyActivitySpec(
  dataset: ReadonlyArray<DailyActivityRow>,
  opts: Readonly<{
    mode: DailyViewMode;
    hasOverlay: boolean;
    overlayLabel: string;
    colors: DailyActivityColors;
    barLabels: Readonly<{ input: string; output: string; cacheRead: string; cacheWrite: string; current: string; optimized: string; locAdded: string; locDeleted: string }>;
  }>,
): ChartSpec {
  const { colors, barLabels, mode } = opts;
  const categories = dataset.map((d) => d.date);
  const barSeries: Series[] = buildBarSeries(dataset, mode, colors, barLabels);
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
      stacked: mode !== 'cost',
      legend: 'bottom',
      ...(opts.hasOverlay ? { yAxisRight: { label: opts.overlayLabel } } : {}),
    },
  };
}
