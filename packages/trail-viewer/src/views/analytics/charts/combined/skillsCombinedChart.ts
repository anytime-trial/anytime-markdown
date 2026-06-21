/**
 * vanilla 版 SkillsCombinedChart
 * (`components/analytics/charts/combined/SkillsCombinedChart.tsx` の素 DOM 等価)。
 */
import type { CombinedAxisInfo } from '../../../../components/analytics/charts/combined/axisInfo';
import { makeCategoryClick } from '../../../../components/analytics/charts/combined/axisInfo';
import { buildStackedBarSpec } from '../../../../components/analytics/charts/specs/buildStackedBarSpec';
import { mountAnytimeChartView } from '../../anytimeChartView';
import type { VanillaViewHandle } from '../../../../shared/vanillaIsland';

export interface SkillsCombinedChartProps {
  axisInfo: CombinedAxisInfo;
  canDrill: boolean;
  onDateClick?: (date: string) => void;
  isDark: boolean;
  cardSx: { bgcolor: string; border: string; borderRadius: string };
  getSkillCategory: (skill: string) => number;
  getSkillCategoryLabel: (cat: number) => string;
  getSkillCategoryColorByIndex: (cat: number) => string;
  skillCategoryKeys: readonly number[];
}

function buildSpec(p: SkillsCombinedChartProps) {
  const { skillRows, allPeriods, labels } = p.axisInfo;
  const valMap = new Map<string, number>();
  for (const r of skillRows) {
    const cat = p.getSkillCategory(r.skill);
    valMap.set(`${r.period}::${cat}`, (valMap.get(`${r.period}::${cat}`) ?? 0) + r.count);
  }
  return buildStackedBarSpec({
    categories: labels,
    series: p.skillCategoryKeys.map((cat) => ({
      name: p.getSkillCategoryLabel(cat),
      values: allPeriods.map((pp) => valMap.get(`${pp}::${cat}`) ?? 0),
      color: p.getSkillCategoryColorByIndex(cat),
    })),
  });
}

function applyCardStyle(card: HTMLElement, cardSx: { bgcolor: string; border: string; borderRadius: string }): void {
  card.style.backgroundColor = cardSx.bgcolor;
  card.style.border = cardSx.border;
  card.style.borderRadius = cardSx.borderRadius;
  card.style.padding = '16px';
}

export function mountSkillsCombinedChart(
  container: HTMLElement,
  initial: SkillsCombinedChartProps,
): VanillaViewHandle<SkillsCombinedChartProps> {
  let props = initial;

  const card = document.createElement('div');
  applyCardStyle(card, props.cardSx);
  container.appendChild(card);

  const emptyEl = document.createElement('p');
  emptyEl.style.cssText = 'margin:0;font-size:0.875rem;color:var(--am-color-text-secondary);';
  emptyEl.textContent = '0';

  let chartHandle: ReturnType<typeof mountAnytimeChartView> | null = null;

  function render(p: SkillsCombinedChartProps): void {
    if (p.axisInfo.skillRows.length === 0) {
      chartHandle?.destroy();
      chartHandle = null;
      card.replaceChildren(emptyEl);
      return;
    }
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
      applyCardStyle(card, next.cardSx);
      render(next);
    },
    destroy() {
      chartHandle?.destroy();
      card.remove();
    },
  };
}
