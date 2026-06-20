import { useMemo } from 'react';
import { Paper, Typography } from '../../../../ui';
import type { ChartSpec, Series } from '@anytime-markdown/chart-core';
import { useTrailTheme } from '../../../TrailThemeContext';
import { useCommitCategory } from '../../../CommitCategoryContext';
import { LEAD_TIME_LOC_COLOR } from '../../../../theme/designTokens';
import type { CommitMetric } from '../../types';
import type { CombinedAxisInfo } from './axisInfo';
import { makeCategoryClick } from './axisInfo';
import { AnytimeChartView } from '../AnytimeChartView';

export function buildCumulativeCommitDataset(args: Readonly<{
  commitPeriods: readonly string[];
  commitLabels: readonly string[];
  commitRows: ReadonlyArray<{ period: string; prefix: string; count: number }>;
  baselinePerCategory: ReadonlyMap<number, number>;
  baselineFix: number;
  baselineTotal: number;
  categoryKeys: readonly number[];
  getCategory: (prefix: string) => number;
}>) {
  const { commitPeriods, commitLabels, commitRows, baselinePerCategory, baselineFix, baselineTotal, categoryKeys, getCategory } = args;
  const incByPeriodCat = new Map<string, number>();
  const totalByPeriod = new Map<string, number>();
  const fixByPeriod = new Map<string, number>();
  for (const r of commitRows) {
    const cat = getCategory(r.prefix);
    incByPeriodCat.set(`${r.period}::${cat}`, (incByPeriodCat.get(`${r.period}::${cat}`) ?? 0) + r.count);
    totalByPeriod.set(r.period, (totalByPeriod.get(r.period) ?? 0) + r.count);
    if (r.prefix === 'fix') {
      fixByPeriod.set(r.period, (fixByPeriod.get(r.period) ?? 0) + r.count);
    }
  }
  const runningPerCat = new Map<number, number>();
  for (const cat of categoryKeys) runningPerCat.set(cat, baselinePerCategory.get(cat) ?? 0);
  let runningFix = baselineFix;
  let runningTotal = baselineTotal;
  return commitPeriods.map((p, pi) => {
    for (const cat of categoryKeys) {
      runningPerCat.set(cat, (runningPerCat.get(cat) ?? 0) + (incByPeriodCat.get(`${p}::${cat}`) ?? 0));
    }
    runningFix += fixByPeriod.get(p) ?? 0;
    runningTotal += totalByPeriod.get(p) ?? 0;
    const row: Record<string, string | number | null> = { period: commitLabels[pi] };
    for (const cat of categoryKeys) row[`c${cat}`] = runningPerCat.get(cat) ?? 0;
    row.fixRate = runningTotal > 0 ? (runningFix / runningTotal) * 100 : null;
    return row;
  });
}

export function CommitsCombinedChart({
  axisInfo,
  commitMetric,
  canDrill,
  onDateClick,
}: Readonly<{
  axisInfo: CombinedAxisInfo;
  commitMetric: CommitMetric;
  canDrill: boolean;
  onDateClick?: (date: string) => void;
}>) {
  const { cardSx } = useTrailTheme();
  const { getCategory, getCategoryLabel, getCategoryColorByIndex, categoryKeys } = useCommitCategory();
  const { commitRows, commitRowsPreWindow, commitPeriods, commitLabels, commitPrefixes, aiRateRows, commitBaseline } = axisInfo;
  const isCumulative = commitMetric === 'cumulative';

  // baseline = backend baseline (< 30日前 固定) + fetched window 内の表示 cutoff 以前 (commitRowsPreWindow)
  // これにより 7d 表示でも 30〜7日前の commit が累積に含まれる
  const baselinePerCategory = useMemo(() => {
    const map = new Map<number, number>();
    for (const cat of categoryKeys) map.set(cat, 0);
    if (commitBaseline) {
      for (const e of commitBaseline.perPrefix) {
        const cat = getCategory(e.prefix);
        map.set(cat, (map.get(cat) ?? 0) + e.count);
      }
    }
    for (const r of commitRowsPreWindow) {
      const cat = getCategory(r.prefix);
      map.set(cat, (map.get(cat) ?? 0) + r.count);
    }
    return map;
  }, [commitBaseline, commitRowsPreWindow, categoryKeys, getCategory]);

  const baselineFix = useMemo(() => {
    const fromBackend = commitBaseline?.perPrefix.find((e) => e.prefix === 'fix')?.count ?? 0;
    const fromPreWindow = commitRowsPreWindow.reduce((acc, r) => acc + (r.prefix === 'fix' ? r.count : 0), 0);
    return fromBackend + fromPreWindow;
  }, [commitBaseline, commitRowsPreWindow]);

  const baselineTotal = useMemo(() => {
    const fromBackend = commitBaseline?.totalCount ?? 0;
    const fromPreWindow = commitRowsPreWindow.reduce((acc, r) => acc + r.count, 0);
    return fromBackend + fromPreWindow;
  }, [commitBaseline, commitRowsPreWindow]);

  const cumulativeDataset = useMemo(() => {
    if (!isCumulative) return null;
    return buildCumulativeCommitDataset({
      commitPeriods,
      commitLabels,
      commitRows,
      baselinePerCategory,
      baselineFix,
      baselineTotal,
      categoryKeys,
      getCategory,
    });
  }, [isCumulative, commitPeriods, commitLabels, commitRows, baselinePerCategory, baselineFix, baselineTotal, categoryKeys, getCategory]);

  const commitDataset = useMemo(() => {
    if (isCumulative) return [];
    const valMap = new Map<string, number>();
    for (const r of commitRows) {
      const cat = getCategory(r.prefix);
      const key = `${r.period}::${cat}`;
      const value = commitMetric === 'loc' ? (r.linesAdded ?? 0) + (r.linesDeleted ?? 0) : r.count;
      valMap.set(key, (valMap.get(key) ?? 0) + value);
    }
    return commitPeriods.map((p, pi) => {
      const entry: Record<string, string | number> = { period: commitLabels[pi] };
      for (const cat of categoryKeys) {
        entry[`c${cat}`] = valMap.get(`${p}::${cat}`) ?? 0;
      }
      return entry;
    });
  }, [isCumulative, commitRows, commitPeriods, commitLabels, commitMetric, getCategory, categoryKeys]);

  const showRate = commitMetric === 'count';

  const spec = useMemo<ChartSpec>(() => {
    const num = (row: Record<string, string | number | null>, key: string): number => {
      const v = row[key];
      return typeof v === 'number' ? v : 0;
    };
    if (isCumulative) {
      const dataset = cumulativeDataset ?? [];
      const areaSeries: Series[] = categoryKeys.map((cat) => ({
        name: getCategoryLabel(cat),
        type: 'area',
        color: getCategoryColorByIndex(cat),
        values: dataset.map((row) => num(row, `c${cat}`)),
      }));
      const fixRate: Series = {
        name: 'fix 比率 (%)',
        type: 'line',
        axis: 'right',
        color: LEAD_TIME_LOC_COLOR,
        connectNulls: true,
        values: dataset.map((row) => (typeof row.fixRate === 'number' ? row.fixRate : null)),
      };
      return {
        kind: 'combo',
        categories: dataset.map((row) => String(row.period)),
        series: [...areaSeries, fixRate],
        options: { stacked: true, legend: 'bottom', yAxisRight: { label: '%' } },
      };
    }
    const rateByPeriod = new Map<string, number | null>();
    if (showRate) for (const r of aiRateRows) rateByPeriod.set(r.period, r.sampleSize > 0 ? r.rate : null);
    const barSeries: Series[] = categoryKeys.map((cat) => ({
      name: getCategoryLabel(cat),
      type: 'bar',
      color: getCategoryColorByIndex(cat),
      values: commitDataset.map((row) => num(row, `c${cat}`)),
    }));
    const lineSeries: Series[] = showRate
      ? [{
          name: 'AI 1 発成功率 (%)',
          type: 'line',
          axis: 'right',
          color: LEAD_TIME_LOC_COLOR,
          connectNulls: true,
          values: commitDataset.map((_row, i) => rateByPeriod.get(commitPeriods[i]) ?? null),
        }]
      : [];
    return {
      kind: 'combo',
      categories: commitDataset.map((row) => String(row.period)),
      series: [...barSeries, ...lineSeries],
      options: { stacked: true, legend: 'bottom', ...(showRate ? { yAxisRight: { label: '%' } } : {}) },
    };
  }, [isCumulative, cumulativeDataset, commitDataset, showRate, aiRateRows, commitPeriods, categoryKeys, getCategoryLabel, getCategoryColorByIndex]);

  if (commitPrefixes.length === 0 && (!isCumulative || (commitBaseline?.totalCount ?? 0) === 0)) {
    return <Typography variant="body2" color="text.secondary">0</Typography>;
  }

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <AnytimeChartView spec={spec} height={260} onCategoryClick={makeCategoryClick(commitPeriods, canDrill, onDateClick)} />
    </Paper>
  );
}
