import { useMemo } from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { BarPlot } from '@mui/x-charts/BarChart';
import { LinePlot, MarkPlot } from '@mui/x-charts/LineChart';
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
  const { getCategoryColor } = useCommitCategory();
  const { commitRows, commitPeriods, commitLabels, commitPrefixes, commitMap, aiRateRows } = axisInfo;

  const commitDataset = useMemo(() => {
    const valMap = new Map<string, number>();
    for (const r of commitRows) {
      const displayKey = commitMap.get(r.prefix) ?? r.prefix;
      const key = `${r.period}::${displayKey}`;
      const value = commitMetric === 'loc' ? (r.linesAdded ?? 0) + (r.linesDeleted ?? 0) : r.count;
      valMap.set(key, (valMap.get(key) ?? 0) + value);
    }
    return commitPeriods.map((p, pi) => {
      const entry: Record<string, string | number> = { period: commitLabels[pi] };
      for (let i = 0; i < commitPrefixes.length; i++) {
        entry[`c${i}`] = valMap.get(`${p}::${commitPrefixes[i]}`) ?? 0;
      }
      return entry;
    });
  }, [commitRows, commitPeriods, commitLabels, commitPrefixes, commitMap, commitMetric]);

  if (commitPrefixes.length === 0) {
    return <Typography variant="body2" color="text.secondary">0</Typography>;
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

  const barSeries = commitPrefixes.map((prefix, i) => ({
    type: 'bar' as const,
    dataKey: `c${i}`,
    label: prefix,
    stack: 'total',
    color: getCategoryColor(prefix),
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
