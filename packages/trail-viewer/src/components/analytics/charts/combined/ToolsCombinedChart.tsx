import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import { useTrailTheme } from '../../../TrailThemeContext';
import type { ChartMetric } from '../../types';
import type { CombinedAxisInfo } from './axisInfo';
import { makeCategoryClick } from './axisInfo';
import { useToolCategory } from '../../../ToolCategoryContext';
import { AnytimeChartView } from '../AnytimeChartView';
import { buildStackedBarSpec } from '../specs/buildStackedBarSpec';

export function ToolsCombinedChart({
  axisInfo,
  toolMetric,
  canDrill,
  onDateClick,
}: Readonly<{
  axisInfo: CombinedAxisInfo;
  toolMetric: ChartMetric;
  canDrill: boolean;
  onDateClick?: (date: string) => void;
}>) {
  const { cardSx } = useTrailTheme();
  const { getToolCategory, getToolCategoryLabel, getToolCategoryColorByIndex, toolCategoryKeys } = useToolCategory();
  const { toolRows, allPeriods, labels } = axisInfo;

  const spec = useMemo(() => {
    const getValue = (r: { count: number; tokens?: number }): number =>
      toolMetric === 'tokens' ? (r.tokens ?? 0) : r.count;
    const valMap = new Map<string, number>();
    for (const r of toolRows) {
      const cat = getToolCategory(r.tool);
      valMap.set(`${r.period}::${cat}`, (valMap.get(`${r.period}::${cat}`) ?? 0) + getValue(r));
    }
    return buildStackedBarSpec({
      categories: labels,
      series: toolCategoryKeys.map((cat) => ({
        name: getToolCategoryLabel(cat),
        values: allPeriods.map((p) => valMap.get(`${p}::${cat}`) ?? 0),
        color: getToolCategoryColorByIndex(cat),
      })),
    });
  }, [toolRows, allPeriods, labels, toolMetric, getToolCategory, getToolCategoryLabel, getToolCategoryColorByIndex, toolCategoryKeys]);

  if (toolRows.length === 0) {
    return <Typography variant="body2" color="text.secondary">0</Typography>;
  }

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <AnytimeChartView spec={spec} height={240} onCategoryClick={makeCategoryClick(allPeriods, canDrill, onDateClick)} />
    </Paper>
  );
}
