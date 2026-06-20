import { useMemo } from 'react';
import Paper from '@mui/material/Paper';
import { useTrailTheme } from '../../../TrailThemeContext';
import { useTrailI18n } from '../../../../i18n';
import { fmtPercent } from '../../../../domain/analytics/formatters';
import { agentBrandColors } from '../../../../theme/designTokens';
import type { AgentMetric } from '../../types';
import type { CombinedAxisInfo } from './axisInfo';
import { makeCategoryClick } from './axisInfo';
import { AnytimeChartView } from '../AnytimeChartView';
import { buildStackedBarSpec } from '../specs/buildStackedBarSpec';

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

  const agentSeriesLabel = (agent: string): string => {
    const missing = agentMissingByDisplay.get(agent);
    const rate = missing && missing.total > 0 ? missing.missing / missing.total : 0;
    return `${agent} (${t('analytics.combined.missingRate')} ${fmtPercent(rate)})`;
  };

  const spec = useMemo(() => {
    const getValue = (r: { tokens: number; costUsd: number; loc: number }): number =>
      agentMetric === 'tokens' ? r.tokens : agentMetric === 'cost' ? r.costUsd : r.loc;
    const valMap = new Map<string, number>();
    for (const r of agentRows) {
      const displayKey = agentMap.get(r.agent) ?? r.agent;
      valMap.set(`${r.period}::${displayKey}`, (valMap.get(`${r.period}::${displayKey}`) ?? 0) + getValue(r));
    }
    return buildStackedBarSpec({
      categories: agentLabels,
      series: agents.map((agent, i) => ({
        name: agentSeriesLabel(agent),
        values: agentPeriods.map((p) => valMap.get(`${p}::${agent}`) ?? 0),
        color: agentBrandColors[agent] ?? toolPalette[i % toolPalette.length],
      })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentRows, agentPeriods, agentLabels, agents, agentMap, agentMetric, toolPalette]);

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <AnytimeChartView spec={spec} height={240} onCategoryClick={makeCategoryClick(agentPeriods, canDrill, onDateClick)} />
    </Paper>
  );
}
