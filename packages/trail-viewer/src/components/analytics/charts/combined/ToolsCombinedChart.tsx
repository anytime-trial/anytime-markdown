import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { BarChart } from '@mui/x-charts/BarChart';
import { useMemo } from 'react';
import { useTrailTheme } from '../../../TrailThemeContext';
import { useTrailI18n } from '../../../../i18n';
import { fmtNum, fmtPercent, fmtTokens } from '../../../../domain/analytics/formatters';
import type { ChartMetric } from '../../types';
import type { CombinedAxisInfo } from './axisInfo';
import { makeAxisClick } from './axisInfo';

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
  const { cardSx, toolPalette } = useTrailTheme();
  const { t } = useTrailI18n();
  const { toolRows, allPeriods, labels, tools, toolMap, toolMissingByDisplay } = axisInfo;

  const dataset = useMemo(() => {
    const getValue = (r: { count: number; tokens?: number }): number =>
      toolMetric === 'tokens' ? (r.tokens ?? 0) : r.count;
    const valMap = new Map<string, number>();
    for (const r of toolRows) {
      const displayKey = toolMap.get(r.tool) ?? r.tool;
      const key = `${r.period}::${displayKey}`;
      valMap.set(key, (valMap.get(key) ?? 0) + getValue(r));
    }
    return allPeriods.map((p, pi) => {
      const entry: Record<string, string | number> = { period: labels[pi] };
      for (let i = 0; i < tools.length; i++) {
        entry[`t${i}`] = valMap.get(`${p}::${tools[i]}`) ?? 0;
      }
      return entry;
    });
  }, [toolRows, allPeriods, labels, tools, toolMap, toolMetric]);

  const tooltipFormatter = (v: number | null): string | null => {
    if (v == null || v === 0) return null;
    return toolMetric === 'tokens' ? fmtTokens(v) : fmtNum(v);
  };

  const toolSeriesLabel = (tool: string): string => {
    const missing = toolMissingByDisplay.get(tool);
    const rate = missing && missing.total > 0 ? missing.missing / missing.total : 0;
    return rate > 0 ? `${tool} (${t('analytics.combined.missingRate')} ${fmtPercent(rate)})` : tool;
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
        series={tools.map((tool, i) => ({
          dataKey: `t${i}`,
          label: toolSeriesLabel(tool),
          stack: 'total',
          color: toolPalette[i % toolPalette.length],
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
