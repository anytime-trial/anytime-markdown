/**
 * vanilla 版 SessionToolUsageChart
 * (`components/analytics/charts/SessionToolUsageChart.tsx` の素 DOM 等価)。
 */
import type { ToolMetrics } from '../../../domain/parser/types';
import type { ThemeColors } from '../../../theme/designTokens';
import { buildPieSpec } from '../../../components/analytics/charts/specs/buildPieSpec';
import { mountAnytimeChartView } from '../anytimeChartView';
import { mountChartTitle } from '../charts/shared/chartTitle';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';

export interface SessionToolUsageChartProps {
  toolMetrics: ToolMetrics | null;
  colors: ThemeColors;
  cardSx: { bgcolor: string; border: string; borderRadius: string };
  isDark: boolean;
  t: (k: string) => string;
}

function applyCardStyle(
  el: HTMLElement,
  cardSx: { bgcolor: string; border: string; borderRadius: string },
): void {
  el.style.backgroundColor = cardSx.bgcolor;
  el.style.border = cardSx.border;
  el.style.borderRadius = cardSx.borderRadius;
  el.style.paddingTop = '12px';
  el.style.paddingBottom = '8px';
  el.style.flex = '1';
  el.style.minWidth = '0';
}

export function mountSessionToolUsageChart(
  container: HTMLElement,
  initial: SessionToolUsageChartProps,
): VanillaViewHandle<SessionToolUsageChartProps> {
  let props = initial;

  const card = document.createElement('div');
  applyCardStyle(card, props.cardSx);
  container.appendChild(card);

  const titleHandle = mountChartTitle(card, {
    title: props.t('analytics.toolUsageTitle'),
    description: props.t('analytics.toolUsageTitle.description'),
  });

  const contentEl = document.createElement('div');
  contentEl.style.cssText = 'height:130px;display:flex;align-items:center;justify-content:center;';
  card.appendChild(contentEl);

  let chartHandle: ReturnType<typeof mountAnytimeChartView> | null = null;

  function render(): void {
    chartHandle?.destroy();
    chartHandle = null;
    contentEl.innerHTML = '';

    const usage = props.toolMetrics?.toolUsage;
    if (!usage || usage.length === 0) {
      const zero = document.createElement('span');
      zero.style.cssText = `font-size:1.5rem;color:${props.colors.textSecondary};`;
      zero.textContent = '0';
      contentEl.appendChild(zero);
      return;
    }

    const sorted = [...usage].sort((a, b) => b.count - a.count);
    const spec = buildPieSpec(sorted.map((e) => ({ label: `${e.tool} (${e.count})`, value: e.count })));
    chartHandle = mountAnytimeChartView(contentEl, { spec, height: 130, isDark: props.isDark });
  }

  render();

  return {
    update(next) {
      props = next;
      applyCardStyle(card, next.cardSx);
      titleHandle.update({
        title: next.t('analytics.toolUsageTitle'),
        description: next.t('analytics.toolUsageTitle.description'),
      });
      render();
    },
    destroy() {
      chartHandle?.destroy();
      titleHandle.destroy();
      card.remove();
    },
  };
}
