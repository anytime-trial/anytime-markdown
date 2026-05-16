import { useMemo } from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { BarChart } from '@mui/x-charts/BarChart';
import { useTrailTheme } from '../../../TrailThemeContext';
import { fmtNum, fmtTokens } from '../../../../domain/analytics/formatters';
import type { ChartMetric } from '../../types';
import type { CombinedAxisInfo } from './axisInfo';
import { makeAxisClick } from './axisInfo';

export function ReposCombinedChart({
  axisInfo,
  repoMetric,
  canDrill,
  onDateClick,
}: Readonly<{
  axisInfo: CombinedAxisInfo;
  repoMetric: ChartMetric;
  canDrill: boolean;
  onDateClick?: (date: string) => void;
}>) {
  const { cardSx, toolPalette } = useTrailTheme();
  const { repoRows, repoPeriods, repoLabels, repos, repoMap } = axisInfo;

  const dataset = useMemo(() => {
    const getValue = (r: { count: number; tokens: number }): number =>
      repoMetric === 'tokens' ? r.tokens : r.count;
    const valMap = new Map<string, number>();
    for (const r of repoRows) {
      const displayKey = repoMap.get(r.repoName) ?? r.repoName;
      const key = `${r.period}::${displayKey}`;
      valMap.set(key, (valMap.get(key) ?? 0) + getValue(r));
    }
    return repoPeriods.map((p, pi) => {
      const entry: Record<string, string | number> = { period: repoLabels[pi] };
      for (let i = 0; i < repos.length; i++) {
        entry[`r${i}`] = valMap.get(`${p}::${repos[i]}`) ?? 0;
      }
      return entry;
    });
  }, [repoRows, repoPeriods, repoLabels, repos, repoMap, repoMetric]);

  const tooltipFormatter = (v: number | null): string | null => {
    if (v == null || v === 0) return null;
    return repoMetric === 'tokens' ? fmtTokens(v) : fmtNum(v);
  };

  if (repos.length === 0) {
    return <Typography variant="body2" color="text.secondary">0</Typography>;
  }

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <BarChart
        dataset={dataset}
        xAxis={[{ scaleType: 'band', dataKey: 'period' }]}
        yAxis={[{ valueFormatter: repoMetric === 'tokens' ? fmtTokens : fmtNum }]}
        series={repos.map((repo, i) => ({
          dataKey: `r${i}`,
          label: repo,
          stack: 'total',
          color: toolPalette[i % toolPalette.length],
          valueFormatter: tooltipFormatter,
        }))}
        height={240}
        margin={{ left: 16, right: 8, top: 8, bottom: 60 }}
        slotProps={{ legend: { direction: 'horizontal', position: { vertical: 'bottom', horizontal: 'center' } } }}
        onAxisClick={makeAxisClick(repoPeriods, canDrill, onDateClick)}
      />
    </Paper>
  );
}
