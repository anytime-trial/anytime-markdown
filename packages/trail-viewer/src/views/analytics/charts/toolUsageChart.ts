/**
 * vanilla 版 ToolUsageChart（水平バーチャート）
 * (`components/analytics/charts/ToolUsageChart.tsx` の素 DOM 等価)。
 * `<anytime-chart>` は使わず、素 DOM で描画する。
 */
import type { AnalyticsData } from '../../../domain/parser/types';
import type { ThemeChartColors } from '../../../theme/designTokens';
import { radius } from '../../../theme/designTokens';
import { fmtNum } from '../../../domain/analytics/formatters';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';

export interface ToolUsageChartProps {
  items: AnalyticsData['toolUsage'];
  chartColors: ThemeChartColors;
  /** radius object — matches `typeof radius` from designTokens */
  radius: typeof radius;
  t: (k: string) => string;
}

export function mountToolUsageChart(
  container: HTMLElement,
  initial: ToolUsageChartProps,
): VanillaViewHandle<ToolUsageChartProps> {
  let props = initial;

  if (props.items.length === 0) {
    return {
      update(next) { props = next; },
      destroy() {},
    };
  }

  const root = document.createElement('div');
  container.appendChild(root);

  function render(): void {
    root.innerHTML = '';

    if (props.items.length === 0) return;

    const title = document.createElement('div');
    title.style.cssText = 'font-size:0.9375rem;font-weight:600;margin-bottom:8px;';
    title.textContent = props.t('analytics.toolUsageTitle');
    root.appendChild(title);

    const maxCount = props.items[0].count;

    for (const item of props.items) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;margin-bottom:4px;';

      const nameEl = document.createElement('span');
      nameEl.style.cssText =
        'width:120px;flex-shrink:0;text-align:right;padding-right:8px;font-family:monospace;font-size:0.875rem;';
      nameEl.textContent = item.name;

      const barEl = document.createElement('div');
      const pct = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
      barEl.style.cssText = `height:18px;width:${pct}%;min-width:4px;background-color:${props.chartColors.primary};border-radius:${props.radius.sm};`;

      const countEl = document.createElement('span');
      countEl.style.cssText = 'padding-left:8px;white-space:nowrap;font-size:0.75rem;';
      countEl.textContent = fmtNum(item.count);

      row.appendChild(nameEl);
      row.appendChild(barEl);
      row.appendChild(countEl);
      root.appendChild(row);
    }
  }

  render();

  return {
    update(next) {
      props = next;
      render();
    },
    destroy() {
      root.remove();
    },
  };
}
