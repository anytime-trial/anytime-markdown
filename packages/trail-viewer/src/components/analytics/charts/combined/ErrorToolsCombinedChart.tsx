import { useMemo } from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { ChartSpec, Series } from '@anytime-markdown/chart-core';
import { useTrailTheme } from '../../../TrailThemeContext';
import type { CombinedAxisInfo } from './axisInfo';
import { makeCategoryClick } from './axisInfo';
import { useToolCategory } from '../../../ToolCategoryContext';
import { AnytimeChartView } from '../AnytimeChartView';

const RETRY_COLOR = '#FFB74D';
const BUILD_FAIL_COLOR = '#EF5350';
const TEST_FAIL_COLOR = '#AB47BC';

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
  const { getToolCategory, getToolCategoryLabel, getToolCategoryColorByIndex, toolCategoryKeys } = useToolCategory();
  const { errorRows, allPeriods, labels, qualityRates } = axisInfo;

  const hasRates = qualityRates.length > 0;

  const spec = useMemo<ChartSpec>(() => {
    const rateByPeriod = new Map<string, { retry: number | null; build: number | null; test: number | null }>();
    for (const r of qualityRates) rateByPeriod.set(r.period, { retry: r.retryRate, build: r.buildFailRate, test: r.testFailRate });
    const valMap = new Map<string, number>();
    for (const r of errorRows) {
      for (const [tool, v] of Object.entries(r.byTool)) {
        const cat = getToolCategory(tool);
        valMap.set(`${r.period}::${cat}`, (valMap.get(`${r.period}::${cat}`) ?? 0) + v);
      }
    }
    const barSeries: Series[] = toolCategoryKeys.map((cat) => ({
      name: getToolCategoryLabel(cat),
      type: 'bar',
      color: getToolCategoryColorByIndex(cat),
      values: allPeriods.map((p) => valMap.get(`${p}::${cat}`) ?? 0),
    }));
    const lineSeries: Series[] = hasRates
      ? [
          { name: 'Retry Rate (%)', type: 'line', axis: 'right', color: RETRY_COLOR, values: allPeriods.map((p) => rateByPeriod.get(p)?.retry ?? null) },
          { name: 'Build Fail (%)', type: 'line', axis: 'right', color: BUILD_FAIL_COLOR, values: allPeriods.map((p) => rateByPeriod.get(p)?.build ?? null) },
          { name: 'Test Fail (%)', type: 'line', axis: 'right', color: TEST_FAIL_COLOR, values: allPeriods.map((p) => rateByPeriod.get(p)?.test ?? null) },
        ]
      : [];
    return {
      kind: 'combo',
      categories: labels,
      series: [...barSeries, ...lineSeries],
      options: { stacked: true, ...(hasRates ? { yAxisRight: { label: '%' } } : {}) },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorRows, allPeriods, labels, qualityRates, hasRates, getToolCategory, getToolCategoryLabel, getToolCategoryColorByIndex, toolCategoryKeys]);

  if (errorRows.length === 0 && !hasRates) {
    return (
      <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
        <Typography variant="body2" color="text.secondary">0</Typography>
      </Paper>
    );
  }

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <AnytimeChartView spec={spec} height={260} onCategoryClick={makeCategoryClick(allPeriods, canDrill, onDateClick)} />
    </Paper>
  );
}
