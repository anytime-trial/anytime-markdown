import { useMemo } from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { BarPlot } from '@mui/x-charts/BarChart';
import { AreaPlot, LinePlot, MarkPlot } from '@mui/x-charts/LineChart';
import { ChartsDataProvider } from '@mui/x-charts/ChartsDataProvider';
import { ChartsSurface } from '@mui/x-charts/ChartsSurface';
import { ChartsWrapper } from '@mui/x-charts/ChartsWrapper';
import { ChartsXAxis } from '@mui/x-charts/ChartsXAxis';
import { ChartsYAxis } from '@mui/x-charts/ChartsYAxis';
import { ChartsTooltip } from '@mui/x-charts/ChartsTooltip';
import { ChartsGrid } from '@mui/x-charts/ChartsGrid';
import { ChartsLegend } from '@mui/x-charts/ChartsLegend';
import { ChartsAxisHighlight } from '@mui/x-charts/ChartsAxisHighlight';
import { useTrailTheme } from '../../../TrailThemeContext';
import { useCommitCategory } from '../../../CommitCategoryContext';
import { fmtTokens } from '../../../../domain/analytics/formatters';
import { LEAD_TIME_LOC_COLOR } from '../../../../theme/designTokens';
import type { CommitMetric } from '../../types';
import type { CombinedAxisInfo } from './axisInfo';
import { makeAxisClick } from './axisInfo';

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
  const { commitRows, commitPeriods, commitLabels, commitPrefixes, aiRateRows, commitBaseline } = axisInfo;
  const isCumulative = commitMetric === 'cumulative';

  const baselinePerCategory = useMemo(() => {
    const map = new Map<number, number>();
    if (!commitBaseline) return map;
    for (const cat of categoryKeys) map.set(cat, 0);
    for (const e of commitBaseline.perPrefix) {
      const cat = getCategory(e.prefix);
      map.set(cat, (map.get(cat) ?? 0) + e.count);
    }
    return map;
  }, [commitBaseline, categoryKeys, getCategory]);

  const baselineFix = useMemo(
    () => commitBaseline?.perPrefix.find((e) => e.prefix === 'fix')?.count ?? 0,
    [commitBaseline],
  );

  const cumulativeDataset = useMemo(() => {
    if (!isCumulative) return null;
    return buildCumulativeCommitDataset({
      commitPeriods,
      commitLabels,
      commitRows,
      baselinePerCategory,
      baselineFix,
      baselineTotal: commitBaseline?.totalCount ?? 0,
      categoryKeys,
      getCategory,
    });
  }, [isCumulative, commitPeriods, commitLabels, commitRows, baselinePerCategory, baselineFix, commitBaseline, categoryKeys, getCategory]);

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

  if (commitPrefixes.length === 0 && (!isCumulative || (commitBaseline?.totalCount ?? 0) === 0)) {
    return <Typography variant="body2" color="text.secondary">0</Typography>;
  }

  if (isCumulative) {
    const dataset = cumulativeDataset ?? [];
    const areaSeries = categoryKeys.map((cat) => ({
      type: 'line' as const,
      dataKey: `c${cat}`,
      label: getCategoryLabel(cat),
      stack: 'cumulative',
      area: true,
      showMark: false,
      color: getCategoryColorByIndex(cat),
      yAxisId: 'countAxis',
    }));
    const fixRateSeries = {
      type: 'line' as const,
      dataKey: 'fixRate',
      label: 'fix 比率 (%)',
      color: LEAD_TIME_LOC_COLOR,
      yAxisId: 'rateAxis',
      showMark: true,
      connectNulls: true,
      valueFormatter: (v: number | null) => v == null ? '-' : `${v.toFixed(2)}%`,
    };
    return (
      <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
        <ChartsDataProvider
          dataset={dataset}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          series={[...areaSeries, fixRateSeries] as any}
          xAxis={[{ id: 'period', scaleType: 'point', dataKey: 'period' }]}
          yAxis={[
            { id: 'countAxis', valueFormatter: fmtTokens },
            { id: 'rateAxis', min: 0, max: 100, position: 'right' as const, valueFormatter: (v: number) => `${v}%` },
          ]}
          height={260}
          margin={{ left: 16, right: 48, top: 8, bottom: 40 }}
          onAxisClick={makeAxisClick(commitPeriods, canDrill, onDateClick)}
        >
          <ChartsWrapper legendDirection="horizontal" legendPosition={{ vertical: 'bottom', horizontal: 'center' }}>
            <ChartsLegend />
            <ChartsSurface>
              <ChartsGrid horizontal />
              <AreaPlot />
              <LinePlot />
              <MarkPlot />
              <ChartsAxisHighlight x="line" />
              <ChartsXAxis axisId="period" />
              <ChartsYAxis axisId="countAxis" />
              <ChartsYAxis axisId="rateAxis" />
            </ChartsSurface>
            <ChartsTooltip />
          </ChartsWrapper>
        </ChartsDataProvider>
      </Paper>
    );
  }

  const showRate = commitMetric === 'count';
  const rateByPeriod = new Map<string, number | null>();
  if (showRate) {
    for (const r of aiRateRows) {
      rateByPeriod.set(r.period, r.sampleSize > 0 ? r.rate : null);
    }
  }
  const augmentedDataset = commitDataset.map((row, i) => ({
    ...row,
    rate: showRate ? (rateByPeriod.get(commitPeriods[i]) ?? null) : null,
  }));

  const barSeries = categoryKeys.map((cat) => ({
    type: 'bar' as const,
    dataKey: `c${cat}`,
    label: getCategoryLabel(cat),
    stack: 'total',
    color: getCategoryColorByIndex(cat),
    yAxisId: 'countAxis',
  }));
  const lineSeries = showRate ? [{
    type: 'line' as const,
    dataKey: 'rate',
    label: 'AI 1 発成功率 (%)',
    color: LEAD_TIME_LOC_COLOR,
    yAxisId: 'rateAxis',
    showMark: true,
    connectNulls: true,
    valueFormatter: (v: number | null) => v == null ? '-' : `${v.toFixed(1)}%`,
  }] : [];

  const yAxisConfig = showRate
    ? [
        { id: 'countAxis', valueFormatter: fmtTokens },
        { id: 'rateAxis', min: 0, max: 100, position: 'right' as const, valueFormatter: (v: number) => `${v}%` },
      ]
    : [{ id: 'countAxis', valueFormatter: fmtTokens }];

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <ChartsDataProvider
        dataset={augmentedDataset}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        series={[...barSeries, ...lineSeries] as any}
        xAxis={[{ id: 'period', scaleType: 'band', dataKey: 'period' }]}
        yAxis={yAxisConfig}
        height={260}
        margin={{ left: 16, right: showRate ? 48 : 8, top: 8, bottom: 40 }}
        onAxisClick={makeAxisClick(commitPeriods, canDrill, onDateClick)}
      >
        <ChartsWrapper legendDirection="horizontal" legendPosition={{ vertical: 'bottom', horizontal: 'center' }}>
          <ChartsLegend />
          <ChartsSurface>
            <ChartsGrid horizontal />
            <BarPlot />
            {showRate && <LinePlot />}
            {showRate && <MarkPlot />}
            <ChartsAxisHighlight x="band" />
            <ChartsXAxis axisId="period" />
            <ChartsYAxis axisId="countAxis" />
            {showRate && <ChartsYAxis axisId="rateAxis" />}
          </ChartsSurface>
          <ChartsTooltip />
        </ChartsWrapper>
      </ChartsDataProvider>
    </Paper>
  );
}
