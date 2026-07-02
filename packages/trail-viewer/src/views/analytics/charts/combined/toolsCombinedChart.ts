/**
 * vanilla 版 ToolsCombinedChart
 * (`components/analytics/charts/combined/ToolsCombinedChart.tsx` の素 DOM 等価)。
 */
import type { ChartMetric } from '../../../../components/analytics/types';
import type { CombinedAxisInfo } from '../../../../components/analytics/charts/combined/axisInfo';
import { makeCategoryClick } from '../../../../components/analytics/charts/combined/axisInfo';
import { buildStackedBarSpec } from '../../../../components/analytics/charts/specs/buildStackedBarSpec';
import { mountAnytimeChartView } from '../../anytimeChartView';
import type { VanillaViewHandle } from '../../../../shared/vanillaIsland';

export interface ToolsCombinedChartProps {
  axisInfo: CombinedAxisInfo;
  toolMetric: ChartMetric;
  canDrill: boolean;
  onDateClick?: (date: string) => void;
  isDark: boolean;
  cardSx: { bgcolor: string; border: string; borderRadius: string };
  getToolCategory: (tool: string) => number;
  getToolCategoryLabel: (cat: number) => string;
  getToolCategoryColorByIndex: (cat: number) => string;
  toolCategoryKeys: readonly number[];
}

function buildSpec(p: ToolsCombinedChartProps) {
  const { toolRows, allPeriods, labels } = p.axisInfo;
  const getValue = (r: { count: number; tokens?: number }): number =>
    p.toolMetric === 'tokens' ? (r.tokens ?? 0) : r.count;
  const valMap = new Map<string, number>();
  for (const r of toolRows) {
    const cat = p.getToolCategory(r.tool);
    valMap.set(`${r.period}::${cat}`, (valMap.get(`${r.period}::${cat}`) ?? 0) + getValue(r));
  }
  return buildStackedBarSpec({
    categories: labels,
    series: p.toolCategoryKeys.map((cat) => ({
      name: p.getToolCategoryLabel(cat),
      values: allPeriods.map((pp) => valMap.get(`${pp}::${cat}`) ?? 0),
      color: p.getToolCategoryColorByIndex(cat),
    })),
  });
}

function applyCardStyle(card: HTMLElement, cardSx: { bgcolor: string; border: string; borderRadius: string }): void {
  card.style.backgroundColor = cardSx.bgcolor;
  card.style.border = cardSx.border;
  card.style.borderRadius = cardSx.borderRadius;
  card.style.padding = '16px';
}

export function mountToolsCombinedChart(
  container: HTMLElement,
  initial: ToolsCombinedChartProps,
): VanillaViewHandle<ToolsCombinedChartProps> {
  let props = initial;

  const card = document.createElement('div');
  container.appendChild(card);

  const emptyEl = document.createElement('p');
  emptyEl.style.cssText = 'margin:0;font-size:0.875rem;color:var(--am-color-text-secondary);';
  emptyEl.textContent = '0';

  let chartHandle: ReturnType<typeof mountAnytimeChartView> | null = null;

  function render(p: ToolsCombinedChartProps): void {
    if (p.axisInfo.toolRows.length === 0) {
      chartHandle?.destroy();
      chartHandle = null;
      card.removeAttribute('style');
      card.replaceChildren(emptyEl);
      return;
    }
    applyCardStyle(card, p.cardSx);
    if (emptyEl.isConnected) emptyEl.remove();
    if (!chartHandle) {
      chartHandle = mountAnytimeChartView(card, {
        spec: buildSpec(p),
        height: 240,
        isDark: p.isDark,
        onCategoryClick: makeCategoryClick(p.axisInfo.allPeriods, p.canDrill, p.onDateClick),
      });
    } else {
      chartHandle.update({
        spec: buildSpec(p),
        height: 240,
        isDark: p.isDark,
        onCategoryClick: makeCategoryClick(p.axisInfo.allPeriods, p.canDrill, p.onDateClick),
      });
    }
  }

  render(props);

  return {
    update(next) {
      props = next;
      render(next);
    },
    destroy() {
      chartHandle?.destroy();
      card.remove();
    },
  };
}
