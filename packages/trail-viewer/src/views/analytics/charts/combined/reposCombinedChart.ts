/**
 * vanilla 版 ReposCombinedChart
 * (`components/analytics/charts/combined/ReposCombinedChart.tsx` の素 DOM 等価)。
 */
import type { ChartMetric } from '../../../../components/analytics/types';
import type { CombinedAxisInfo } from '../../../../components/analytics/charts/combined/axisInfo';
import { makeCategoryClick } from '../../../../components/analytics/charts/combined/axisInfo';
import { buildStackedBarSpec } from '../../../../components/analytics/charts/specs/buildStackedBarSpec';
import { mountAnytimeChartView } from '../../anytimeChartView';
import type { VanillaViewHandle } from '../../../../shared/vanillaIsland';

export interface ReposCombinedChartProps {
  axisInfo: CombinedAxisInfo;
  repoMetric: ChartMetric;
  canDrill: boolean;
  onDateClick?: (date: string) => void;
  isDark: boolean;
  toolPalette: readonly string[];
  cardSx: { bgcolor: string; border: string; borderRadius: string };
}

function buildSpec(p: ReposCombinedChartProps) {
  const { repoRows, repoPeriods, repoLabels, repos, repoMap } = p.axisInfo;
  const getValue = (r: { count: number; tokens: number }): number =>
    p.repoMetric === 'tokens' ? r.tokens : r.count;
  const valMap = new Map<string, number>();
  for (const r of repoRows) {
    const displayKey = repoMap.get(r.repoName) ?? r.repoName;
    valMap.set(`${r.period}::${displayKey}`, (valMap.get(`${r.period}::${displayKey}`) ?? 0) + getValue(r));
  }
  return buildStackedBarSpec({
    categories: repoLabels,
    series: repos.map((repo, i) => ({
      name: repo,
      values: repoPeriods.map((pp) => valMap.get(`${pp}::${repo}`) ?? 0),
      color: p.toolPalette[i % p.toolPalette.length],
    })),
  });
}

function applyCardStyle(card: HTMLElement, cardSx: { bgcolor: string; border: string; borderRadius: string }): void {
  card.style.backgroundColor = cardSx.bgcolor;
  card.style.border = cardSx.border;
  card.style.borderRadius = cardSx.borderRadius;
  card.style.padding = '16px';
}

export function mountReposCombinedChart(
  container: HTMLElement,
  initial: ReposCombinedChartProps,
): VanillaViewHandle<ReposCombinedChartProps> {
  let props = initial;

  const card = document.createElement('div');
  container.appendChild(card);

  const emptyEl = document.createElement('p');
  emptyEl.style.cssText = 'margin:0;font-size:0.875rem;color:var(--am-color-text-secondary);';
  emptyEl.textContent = '0';

  let chartHandle: ReturnType<typeof mountAnytimeChartView> | null = null;

  function render(p: ReposCombinedChartProps): void {
    if (p.axisInfo.repos.length === 0) {
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
        onCategoryClick: makeCategoryClick(p.axisInfo.repoPeriods, p.canDrill, p.onDateClick),
      });
    } else {
      chartHandle.update({
        spec: buildSpec(p),
        height: 240,
        isDark: p.isDark,
        onCategoryClick: makeCategoryClick(p.axisInfo.repoPeriods, p.canDrill, p.onDateClick),
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
