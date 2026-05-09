import { useMemo } from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { BarChart } from '@mui/x-charts/BarChart';
import { useTrailTheme } from '../../../TrailThemeContext';
import { fmtTokens } from '../../../../domain/analytics/formatters';
import type { CombinedAxisInfo } from './axisInfo';
import { hideZero, makeAxisClick } from './axisInfo';
import { useToolCategory } from '../../../ToolCategoryContext';

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
  const { errorRows, allPeriods, labels, errTools, errMap } = axisInfo;

  const sortedErrTools = useMemo(
    () => [...errTools].sort((a, b) => getToolCategory(a) - getToolCategory(b)),
    [errTools, getToolCategory],
  );

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
      const entry: Record<string, string | number> = { period: labels[pi] };
      for (let i = 0; i < sortedErrTools.length; i++) {
        entry[`e${i}`] = valMap.get(`${p}::${sortedErrTools[i]}`) ?? 0;
      }
      return entry;
    });
  }, [errorRows, allPeriods, labels, sortedErrTools, errMap]);

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      {sortedErrTools.length === 0 ? (
        <Typography variant="body2" color="text.secondary">0</Typography>
      ) : (
        <BarChart
          dataset={dataset}
          xAxis={[{ scaleType: 'band', dataKey: 'period' }]}
          yAxis={[{ valueFormatter: fmtTokens }]}
          series={sortedErrTools.map((tool, i) => ({
            dataKey: `e${i}`,
            label: tool,
            stack: 'total',
            color: getToolCategoryColor(tool),
            valueFormatter: hideZero,
          }))}
          height={240}
          margin={{ left: 16, right: 8, top: 8, bottom: 40 }}
          slotProps={{ legend: { direction: 'horizontal', position: { vertical: 'bottom', horizontal: 'center' } } }}
          onAxisClick={makeAxisClick(allPeriods, canDrill, onDateClick)}
        />
      )}
    </Paper>
  );
}
