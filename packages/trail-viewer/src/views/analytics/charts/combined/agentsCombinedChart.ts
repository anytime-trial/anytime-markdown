/**
 * vanilla 版 AgentsCombinedChart
 * (`components/analytics/charts/combined/AgentsCombinedChart.tsx` の素 DOM 等価)。
 */
import { agentBrandColors } from '../../../../theme/designTokens';
import { fmtPercent } from '../../../../domain/analytics/formatters';
import type { AgentMetric } from '../../../../components/analytics/types';
import type { CombinedAxisInfo } from '../../../../components/analytics/charts/combined/axisInfo';
import { makeCategoryClick } from '../../../../components/analytics/charts/combined/axisInfo';
import { buildStackedBarSpec } from '../../../../components/analytics/charts/specs/buildStackedBarSpec';
import { mountAnytimeChartView } from '../../anytimeChartView';
import type { VanillaViewHandle } from '../../../../shared/vanillaIsland';

export interface AgentsCombinedChartProps {
  axisInfo: CombinedAxisInfo;
  agentMetric: AgentMetric;
  canDrill: boolean;
  onDateClick?: (date: string) => void;
  isDark: boolean;
  toolPalette: readonly string[];
  cardSx: { bgcolor: string; border: string; borderRadius: string };
  t: (key: string) => string;
}

function buildSpec(p: AgentsCombinedChartProps) {
  const { agentRows, agentPeriods, agentLabels, agents, agentMap, agentMissingByDisplay } = p.axisInfo;
  const agentSeriesLabel = (agent: string): string => {
    const missing = agentMissingByDisplay.get(agent);
    const rate = missing && missing.total > 0 ? missing.missing / missing.total : 0;
    return `${agent} (${p.t('analytics.combined.missingRate')} ${fmtPercent(rate)})`;
  };
  const getValue = (r: { tokens: number; costUsd: number; loc: number }): number =>
    p.agentMetric === 'tokens' ? r.tokens : p.agentMetric === 'cost' ? r.costUsd : r.loc;
  const valMap = new Map<string, number>();
  for (const r of agentRows) {
    const displayKey = agentMap.get(r.agent) ?? r.agent;
    valMap.set(`${r.period}::${displayKey}`, (valMap.get(`${r.period}::${displayKey}`) ?? 0) + getValue(r));
  }
  return buildStackedBarSpec({
    categories: agentLabels,
    series: agents.map((agent, i) => ({
      name: agentSeriesLabel(agent),
      values: agentPeriods.map((pp) => valMap.get(`${pp}::${agent}`) ?? 0),
      color: agentBrandColors[agent] ?? p.toolPalette[i % p.toolPalette.length],
    })),
  });
}

function applyCardStyle(card: HTMLElement, cardSx: { bgcolor: string; border: string; borderRadius: string }): void {
  card.style.backgroundColor = cardSx.bgcolor;
  card.style.border = cardSx.border;
  card.style.borderRadius = cardSx.borderRadius;
  card.style.padding = '16px';
}

export function mountAgentsCombinedChart(
  container: HTMLElement,
  initial: AgentsCombinedChartProps,
): VanillaViewHandle<AgentsCombinedChartProps> {
  let props = initial;

  const card = document.createElement('div');
  applyCardStyle(card, props.cardSx);
  container.appendChild(card);

  const chartHandle = mountAnytimeChartView(card, {
    spec: buildSpec(props),
    height: 240,
    isDark: props.isDark,
    onCategoryClick: makeCategoryClick(props.axisInfo.agentPeriods, props.canDrill, props.onDateClick),
  });

  return {
    update(next) {
      props = next;
      applyCardStyle(card, next.cardSx);
      chartHandle.update({
        spec: buildSpec(next),
        height: 240,
        isDark: next.isDark,
        onCategoryClick: makeCategoryClick(next.axisInfo.agentPeriods, next.canDrill, next.onDateClick),
      });
    },
    destroy() {
      chartHandle.destroy();
      card.remove();
    },
  };
}
