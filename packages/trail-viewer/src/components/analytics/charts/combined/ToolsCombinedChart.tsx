import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { BarChart } from '@mui/x-charts/BarChart';
import { useMemo } from 'react';
import { useTrailTheme } from '../../../TrailThemeContext';
import { fmtNum, fmtTokens } from '../../../../domain/analytics/formatters';
import type { ChartMetric } from '../../types';
import type { CombinedAxisInfo } from './axisInfo';
import { makeAxisClick } from './axisInfo';
import { useToolCategory } from '../../../ToolCategoryContext';

const CATEGORIES = [0, 1, 2, 3, 4] as const;

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
  const { cardSx, toolCategoryColors } = useTrailTheme();
  const { getToolCategory, getToolCategoryLabel } = useToolCategory();
  const { toolRows, allPeriods, labels } = axisInfo;

  const dataset = useMemo(() => {
    const getValue = (r: { count: number; tokens?: number }): number =>
      toolMetric === 'tokens' ? (r.tokens ?? 0) : r.count;
    const valMap = new Map<string, number>();
    for (const r of toolRows) {
      const cat = getToolCategory(r.tool);
      const key = `${r.period}::${cat}`;
      valMap.set(key, (valMap.get(key) ?? 0) + getValue(r));
    }
    return allPeriods.map((p, pi) => {
      const entry: Record<string, string | number> = { period: labels[pi] };
      for (const cat of CATEGORIES) {
        entry[`t${cat}`] = valMap.get(`${p}::${cat}`) ?? 0;
      }
      return entry;
    });
  }, [toolRows, allPeriods, labels, toolMetric, getToolCategory]);

  const tooltipFormatter = (v: number | null): string | null => {
    if (v == null || v === 0) return null;
    return toolMetric === 'tokens' ? fmtTokens(v) : fmtNum(v);
  };

  if (toolRows.length === 0) {
    return <Typography variant="body2" color="text.secondary">0</Typography>;
  }

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <BarChart
        dataset={dataset}
        xAxis={[{ scaleType: 'band', dataKey: 'period' }]}
        yAxis={[{ valueFormatter: fmtTokens }]}
        series={CATEGORIES.map((cat) => ({
          dataKey: `t${cat}`,
          label: getToolCategoryLabel(cat),
          stack: 'total',
          color: toolCategoryColors[cat],
          valueFormatter: tooltipFormatter,
        }))}
        height={240}
        margin={{ left: 16, right: 8, top: 8, bottom: 60 }}
        slotProps={{ legend: { direction: 'horizontal', position: { vertical: 'bottom', horizontal: 'center' } } }}
        onAxisClick={makeAxisClick(allPeriods, canDrill, onDateClick)}
      />
    </Paper>
  );
}
