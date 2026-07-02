/**
 * vanilla 版 ModelsCombinedChart
 * (`components/analytics/charts/combined/ModelsCombinedChart.tsx` の素 DOM 等価)。
 */
import { getModelBrandColor } from '../../../../theme/designTokens';
import { fmtPercent } from '../../../../domain/analytics/formatters';
import type { ChartMetric } from '../../../../components/analytics/types';
import type { CombinedAxisInfo } from '../../../../components/analytics/charts/combined/axisInfo';
import { makeCategoryClick } from '../../../../components/analytics/charts/combined/axisInfo';
import { buildStackedBarSpec } from '../../../../components/analytics/charts/specs/buildStackedBarSpec';
import { mountAnytimeChartView } from '../../anytimeChartView';
import type { VanillaViewHandle } from '../../../../shared/vanillaIsland';

export interface ModelsCombinedChartProps {
  axisInfo: CombinedAxisInfo;
  modelMetric: ChartMetric;
  canDrill: boolean;
  onDateClick?: (date: string) => void;
  isDark: boolean;
  toolPalette: readonly string[];
  cardSx: { bgcolor: string; border: string; borderRadius: string };
  t: (key: string) => string;
}

function buildSpec(p: ModelsCombinedChartProps) {
  const { modelRows, modelPeriods, modelLabels, models, modelMap, modelMissingByDisplay } = p.axisInfo;
  const modelSeriesLabel = (model: string): string => {
    const missing = modelMissingByDisplay.get(model);
    const rate = missing && missing.total > 0 ? missing.missing / missing.total : 0;
    return rate > 0 ? `${model} (${p.t('analytics.combined.missingRate')} ${fmtPercent(rate)})` : model;
  };
  const getValue = (r: { count: number; tokens: number }): number =>
    p.modelMetric === 'tokens' ? r.tokens : r.count;
  const valMap = new Map<string, number>();
  for (const r of modelRows) {
    const displayKey = modelMap.get(r.model) ?? r.model;
    valMap.set(`${r.period}::${displayKey}`, (valMap.get(`${r.period}::${displayKey}`) ?? 0) + getValue(r));
  }
  return buildStackedBarSpec({
    categories: modelLabels,
    series: models.map((model, i) => ({
      name: modelSeriesLabel(model),
      values: modelPeriods.map((pp) => valMap.get(`${pp}::${model}`) ?? 0),
      color: getModelBrandColor(model) ?? p.toolPalette[i % p.toolPalette.length],
    })),
  });
}

function applyCardStyle(card: HTMLElement, cardSx: { bgcolor: string; border: string; borderRadius: string }): void {
  card.style.backgroundColor = cardSx.bgcolor;
  card.style.border = cardSx.border;
  card.style.borderRadius = cardSx.borderRadius;
  card.style.padding = '16px';
}

export function mountModelsCombinedChart(
  container: HTMLElement,
  initial: ModelsCombinedChartProps,
): VanillaViewHandle<ModelsCombinedChartProps> {
  let props = initial;

  const card = document.createElement('div');
  container.appendChild(card);

  // Empty state element
  const emptyEl = document.createElement('p');
  emptyEl.style.cssText = 'margin:0;font-size:0.875rem;color:var(--am-color-text-secondary);';
  emptyEl.textContent = '0';

  let chartHandle: ReturnType<typeof mountAnytimeChartView> | null = null;

  function render(p: ModelsCombinedChartProps): void {
    if (p.axisInfo.models.length === 0) {
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
        onCategoryClick: makeCategoryClick(p.axisInfo.modelPeriods, p.canDrill, p.onDateClick),
      });
    } else {
      chartHandle.update({
        spec: buildSpec(p),
        height: 240,
        isDark: p.isDark,
        onCategoryClick: makeCategoryClick(p.axisInfo.modelPeriods, p.canDrill, p.onDateClick),
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
