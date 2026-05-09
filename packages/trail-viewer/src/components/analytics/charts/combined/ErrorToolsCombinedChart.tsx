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
import { fmtTokens } from '../../../../domain/analytics/formatters';
import type { CombinedAxisInfo } from './axisInfo';
import { hideZero, makeAxisClick } from './axisInfo';
import { useToolCategory } from '../../../ToolCategoryContext';

const RETRY_COLOR = '#FFB74D';
const BUILD_FAIL_COLOR = '#EF5350';
const TEST_FAIL_COLOR = '#AB47BC';

const fmtPct = (v: number | null) => v == null ? '-' : `${v.toFixed(1)}%`;
const rightAxisFmt = (v: number) => `${v.toFixed(0)}%`;

export function ErrorToolsCombinedChart({
  axisInfo,
  canDrill,
  onDateClick,
}: Readonly<{
  axisInfo: CombinedAxisInfo;
  canDrill: boolean;
  onDateClick?: (date: string) => void;
}>) {
  const { cardSx } = useTrailTheme();
  const { getToolCategory, getToolCategoryColor } = useToolCategory();
  const { errorRows, allPeriods, labels, errTools, errMap, qualityRates } = axisInfo;

  const sortedErrTools = useMemo(
    () => [...errTools].sort((a, b) => getToolCategory(a) - getToolCategory(b)),
    [errTools, getToolCategory],
  );

  const rateByPeriod = useMemo(() => {
    const m = new Map<string, { retry: number | null; build: number | null; test: number | null }>();
    for (const r of qualityRates) {
      m.set(r.period, { retry: r.retryRate, build: r.buildFailRate, test: r.testFailRate });
    }
    return m;
  }, [qualityRates]);

  const dataset = useMemo(() => {
    const valMap = new Map<string, number>();
    for (const r of errorRows) {
      for (const [tool, v] of Object.entries(r.byTool)) {
        const displayKey = errMap.get(tool) ?? tool;
        const key = `${r.period}::${displayKey}`;
        valMap.set(key, (valMap.get(key) ?? 0) + v);
      }
    }
    return allPeriods.map((p, pi) => {
      const entry: Record<string, string | number | null> = { period: labels[pi] };
      for (let i = 0; i < sortedErrTools.length; i++) {
        entry[`e${i}`] = valMap.get(`${p}::${sortedErrTools[i]}`) ?? 0;
      }
      const rates = rateByPeriod.get(p);
      entry['retry'] = rates?.retry ?? null;
      entry['buildFail'] = rates?.build ?? null;
      entry['testFail'] = rates?.test ?? null;
      return entry;
    });
  }, [errorRows, allPeriods, labels, sortedErrTools, errMap, rateByPeriod]);

  const hasRates = qualityRates.length > 0;

  const barSeries = sortedErrTools.map((tool, i) => ({
    type: 'bar' as const,
    dataKey: `e${i}`,
    label: tool,
    stack: 'total',
    color: getToolCategoryColor(tool),
    yAxisId: 'countAxis',
    valueFormatter: hideZero,
  }));

  const lineSeries = hasRates ? [
    { type: 'line' as const, dataKey: 'retry', label: 'Retry Rate (%)', color: RETRY_COLOR, yAxisId: 'rateAxis', showMark: true, connectNulls: true, valueFormatter: fmtPct },
    { type: 'line' as const, dataKey: 'buildFail', label: 'Build Fail (%)', color: BUILD_FAIL_COLOR, yAxisId: 'rateAxis', showMark: true, connectNulls: true, valueFormatter: fmtPct },
    { type: 'line' as const, dataKey: 'testFail', label: 'Test Fail (%)', color: TEST_FAIL_COLOR, yAxisId: 'rateAxis', showMark: true, connectNulls: true, valueFormatter: fmtPct },
  ] : [];

  const yAxisConfig = [
    { id: 'countAxis', valueFormatter: fmtTokens },
    ...(hasRates ? [{ id: 'rateAxis', min: 0, max: 100, position: 'right' as const, valueFormatter: rightAxisFmt }] : []),
  ];

  if (sortedErrTools.length === 0 && !hasRates) {
    return (
      <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
        <Typography variant="body2" color="text.secondary">0</Typography>
      </Paper>
    );
  }

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <ChartsDataProvider
        dataset={dataset}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        series={[...barSeries, ...lineSeries] as any}
        xAxis={[{ id: 'period', scaleType: 'band', dataKey: 'period' }]}
        yAxis={yAxisConfig}
        height={260}
        margin={{ left: 16, right: hasRates ? 48 : 8, top: 8, bottom: 40 }}
        onAxisClick={makeAxisClick(allPeriods, canDrill, onDateClick)}
      >
        <ChartsWrapper legendDirection="horizontal" legendPosition={{ vertical: 'bottom', horizontal: 'center' }}>
          <ChartsLegend />
          <ChartsSurface>
            <ChartsGrid horizontal />
            <BarPlot />
            {hasRates && <LinePlot />}
            {hasRates && <MarkPlot />}
            <ChartsAxisHighlight x="band" />
            <ChartsXAxis axisId="period" />
            <ChartsYAxis axisId="countAxis" />
            {hasRates && <ChartsYAxis axisId="rateAxis" />}
          </ChartsSurface>
          <ChartsTooltip />
        </ChartsWrapper>
      </ChartsDataProvider>
    </Paper>
  );
}
