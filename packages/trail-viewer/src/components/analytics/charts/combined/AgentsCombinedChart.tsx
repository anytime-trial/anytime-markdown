import { useMemo } from 'react';
import Paper from '@mui/material/Paper';
import { BarChart } from '@mui/x-charts/BarChart';
import { useTrailTheme } from '../../../TrailThemeContext';
import { useTrailI18n } from '../../../../i18n';
import { fmtNum, fmtPercent, fmtTokens, fmtUsd } from '../../../../domain/analytics/formatters';
import type { AgentMetric } from '../../types';
import type { CombinedAxisInfo } from './axisInfo';
import { makeAxisClick } from './axisInfo';

export function AgentsCombinedChart({
  axisInfo,
  agentMetric,
  canDrill,
  onDateClick,
}: Readonly<{
  axisInfo: CombinedAxisInfo;
  agentMetric: AgentMetric;
  canDrill: boolean;
  onDateClick?: (date: string) => void;
}>) {
  const { cardSx, toolPalette } = useTrailTheme();
  const { t } = useTrailI18n();
  const { agentRows, agentPeriods, agentLabels, agents, agentMap, agentMissingByDisplay } = axisInfo;

  const dataset = useMemo(() => {
    const getValue = (r: { tokens: number; costUsd: number; loc: number }): number =>
      agentMetric === 'tokens' ? r.tokens : agentMetric === 'cost' ? r.costUsd : r.loc;
    const valMap = new Map<string, number>();
    for (const r of agentRows) {
      const displayKey = agentMap.get(r.agent) ?? r.agent;
      const key = `${r.period}::${displayKey}`;
      valMap.set(key, (valMap.get(key) ?? 0) + getValue(r));
    }
    return agentPeriods.map((p, pi) => {
      const entry: Record<string, string | number> = { period: agentLabels[pi] };
      for (let i = 0; i < agents.length; i++) {
        entry[`a${i}`] = valMap.get(`${p}::${agents[i]}`) ?? 0;
      }
      return entry;
    });
  }, [agentRows, agentPeriods, agentLabels, agents, agentMap, agentMetric]);

  const tooltipFormatter = (v: number | null): string | null => {
    if (v == null || v === 0) return null;
    if (agentMetric === 'cost') return fmtUsd(v);
    if (agentMetric === 'tokens') return fmtTokens(v);
    return fmtNum(v);
  };

  const agentSeriesLabel = (agent: string): string => {
    const missing = agentMissingByDisplay.get(agent);
    const rate = missing && missing.total > 0 ? missing.missing / missing.total : 0;
    return `${agent} (${t('analytics.combined.missingRate')} ${fmtPercent(rate)})`;
  };

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <BarChart
        dataset={dataset}
        xAxis={[{ scaleType: 'band', dataKey: 'period' }]}
        yAxis={[{ valueFormatter: agentMetric === 'cost' ? fmtUsd : fmtTokens }]}
        series={agents.map((agent, i) => ({
          dataKey: `a${i}`,
          label: agentSeriesLabel(agent),
          stack: 'total',
          color: toolPalette[i % toolPalette.length],
          valueFormatter: tooltipFormatter,
        }))}
        height={240}
        margin={{ left: 16, right: 8, top: 8, bottom: 60 }}
        slotProps={{ legend: { direction: 'horizontal', position: { vertical: 'bottom', horizontal: 'center' } } }}
        onAxisClick={makeAxisClick(agentPeriods, canDrill, onDateClick)}
      />
    </Paper>
  );
}
