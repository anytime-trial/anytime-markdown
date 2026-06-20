import type { ChartSpec, Series } from '@anytime-markdown/chart-core';

export interface StackedBarSeries {
  readonly name: string;
  readonly values: ReadonlyArray<number>;
  readonly color?: string;
}

/**
 * カテゴリ + 系列群を積み上げ棒 ChartSpec に変換する純粋関数。
 * `stacked=false` を渡すと並列棒（grouped）になる。色は Series.color で維持する。
 */
export function buildStackedBarSpec(input: {
  categories: ReadonlyArray<string>;
  series: ReadonlyArray<StackedBarSeries>;
  title?: string;
  stacked?: boolean;
}): ChartSpec {
  const stacked = input.stacked ?? true;
  const series: Series[] = input.series.map((s) => ({
    name: s.name,
    values: s.values,
    color: s.color,
    type: 'bar',
  }));
  return {
    kind: 'bar',
    title: input.title,
    categories: [...input.categories],
    series,
    options: stacked ? { stacked: true } : { grouped: true },
  };
}
