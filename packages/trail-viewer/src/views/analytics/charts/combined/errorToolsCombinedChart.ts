/**
 * vanilla 版 ErrorToolsCombinedChart
 * (`components/analytics/charts/combined/ErrorToolsCombinedChart.tsx` の素 DOM 等価)。
 */
import type { ChartSpec, Series } from '@anytime-markdown/chart-core';
import type { CombinedAxisInfo } from '../../../../components/analytics/charts/combined/axisInfo';
import { makeCategoryClick } from '../../../../components/analytics/charts/combined/axisInfo';
import { mountAnytimeChartView } from '../../anytimeChartView';
import type { VanillaViewHandle } from '../../../../shared/vanillaIsland';

const RETRY_COLOR = '#FFB74D';
const BUILD_FAIL_COLOR = '#EF5350';
const TEST_FAIL_COLOR = '#AB47BC';

export interface ErrorToolsCombinedChartProps {
  axisInfo: CombinedAxisInfo;
  canDrill: boolean;
  onDateClick?: (date: string) => void;
  isDark: boolean;
  cardSx: { bgcolor: string; border: string; borderRadius: string };
  getToolCategory: (tool: string) => number;
  getToolCategoryLabel: (cat: number) => string;
  getToolCategoryColorByIndex: (cat: number) => string;
  toolCategoryKeys: readonly number[];
}

function buildSpec(p: ErrorToolsCombinedChartProps): ChartSpec {
  const { errorRows, allPeriods, labels, qualityRates } = p.axisInfo;
  const hasRates = qualityRates.length > 0;
  const rateByPeriod = new Map<string, { retry: number | null; build: number | null; test: number | null }>();
  for (const r of qualityRates) {
    rateByPeriod.set(r.period, { retry: r.retryRate, build: r.buildFailRate, test: r.testFailRate });
  }
  const valMap = new Map<string, number>();
  for (const r of errorRows) {
    for (const [tool, v] of Object.entries(r.byTool)) {
      const cat = p.getToolCategory(tool);
      valMap.set(`${r.period}::${cat}`, (valMap.get(`${r.period}::${cat}`) ?? 0) + v);
    }
  }
  const barSeries: Series[] = p.toolCategoryKeys.map((cat) => ({
    name: p.getToolCategoryLabel(cat),
    type: 'bar',
    color: p.getToolCategoryColorByIndex(cat),
    values: allPeriods.map((pp) => valMap.get(`${pp}::${cat}`) ?? 0),
  }));
  const lineSeries: Series[] = hasRates
    ? [
        { name: 'Retry Rate (%)', type: 'line', axis: 'right', color: RETRY_COLOR, connectNulls: true, values: allPeriods.map((pp) => rateByPeriod.get(pp)?.retry ?? null) },
        { name: 'Build Fail (%)', type: 'line', axis: 'right', color: BUILD_FAIL_COLOR, connectNulls: true, values: allPeriods.map((pp) => rateByPeriod.get(pp)?.build ?? null) },
        { name: 'Test Fail (%)', type: 'line', axis: 'right', color: TEST_FAIL_COLOR, connectNulls: true, values: allPeriods.map((pp) => rateByPeriod.get(pp)?.test ?? null) },
      ]
    : [];
  return {
    kind: 'combo',
    categories: labels,
    series: [...barSeries, ...lineSeries],
    options: { stacked: true, legend: 'bottom', ...(hasRates ? { yAxisRight: { label: '%' } } : {}) },
  };
}

function applyCardStyle(card: HTMLElement, cardSx: { bgcolor: string; border: string; borderRadius: string }): void {
  card.style.backgroundColor = cardSx.bgcolor;
  card.style.border = cardSx.border;
  card.style.borderRadius = cardSx.borderRadius;
  card.style.padding = '16px';
}

export function mountErrorToolsCombinedChart(
  container: HTMLElement,
  initial: ErrorToolsCombinedChartProps,
): VanillaViewHandle<ErrorToolsCombinedChartProps> {
  let props = initial;

  const card = document.createElement('div');
  applyCardStyle(card, props.cardSx);
  container.appendChild(card);

  const emptyEl = document.createElement('p');
  emptyEl.style.cssText = 'margin:0;font-size:0.875rem;color:var(--am-color-text-secondary);';
  emptyEl.textContent = '0';

  let chartHandle: ReturnType<typeof mountAnytimeChartView> | null = null;

  function render(p: ErrorToolsCombinedChartProps): void {
    const hasRates = p.axisInfo.qualityRates.length > 0;
    if (p.axisInfo.errorRows.length === 0 && !hasRates) {
      chartHandle?.destroy();
      chartHandle = null;
      card.replaceChildren(emptyEl);
      return;
    }
    if (emptyEl.isConnected) emptyEl.remove();
    if (!chartHandle) {
      chartHandle = mountAnytimeChartView(card, {
        spec: buildSpec(p),
        height: 260,
        isDark: p.isDark,
        onCategoryClick: makeCategoryClick(p.axisInfo.allPeriods, p.canDrill, p.onDateClick),
      });
    } else {
      chartHandle.update({
        spec: buildSpec(p),
        height: 260,
        isDark: p.isDark,
        onCategoryClick: makeCategoryClick(p.axisInfo.allPeriods, p.canDrill, p.onDateClick),
      });
    }
  }

  render(props);

  return {
    update(next) {
      props = next;
      applyCardStyle(card, next.cardSx);
      render(next);
    },
    destroy() {
      chartHandle?.destroy();
      card.remove();
    },
  };
}
