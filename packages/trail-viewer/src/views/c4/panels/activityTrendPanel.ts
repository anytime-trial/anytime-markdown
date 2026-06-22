/**
 * ActivityTrendChart の表示部の vanilla DOM 等価実装。
 * React hooks (useActivityTrend) は呼び出し側 (.tsx wrapper) で解決し、
 * 解決済みデータを props 経由で受け取る。
 */
import type { ChartSpec } from '@anytime-markdown/chart-core';
import { createSelect } from '@anytime-markdown/ui-core';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';

interface AnytimeChartElement extends HTMLElement {
  spec: ChartSpec;
}

export interface ActivityTrendPanelProps {
  readonly elementId: string | null;
  readonly period: string;
  readonly onPeriodChange: (p: string) => void;
  readonly spec: ChartSpec | null;
  readonly legendItems: ReadonlyArray<{ readonly label: string; readonly color: string }>;
  readonly loading: boolean;
  readonly error: string | null;
  readonly isDark: boolean;
  readonly t: (key: string) => string;
}

const PERIOD_OPTIONS = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
] as const;

export function mountActivityTrendPanel(
  container: HTMLElement,
  initial: ActivityTrendPanelProps,
): VanillaViewHandle<ActivityTrendPanelProps> {
  let props = initial;
  let destroyed = false;
  let chartEl: AnytimeChartElement | null = null;
  let chartReady = false;

  const root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:8px;border-top:1px solid var(--am-color-divider);';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Activity trend');
  container.appendChild(root);

  // Title
  const titleEl = document.createElement('span');
  titleEl.style.cssText = 'font-size:0.8rem;font-weight:500;';
  root.appendChild(titleEl);

  // Grid: left (period select + legend) | right (chart)
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;gap:16px;grid-template-columns:max-content minmax(0,1fr);align-items:start;';
  root.appendChild(grid);

  // Left column
  const leftCol = document.createElement('div');
  leftCol.style.cssText = 'display:flex;flex-direction:column;gap:8px;min-width:0;';
  grid.appendChild(leftCol);

  // Period select
  const selectHandle = createSelect({
    value: props.period,
    options: [...PERIOD_OPTIONS],
    onChange: (v) => props.onPeriodChange(v),
    ariaLabel: props.t('c4.hotspot.controls.period'),
    fullWidth: false,
  });
  selectHandle.el.style.minWidth = '88px';
  leftCol.appendChild(selectHandle.el);

  // Legend list
  const legendEl = document.createElement('ul');
  legendEl.style.cssText = 'margin:0;padding:0;display:flex;flex-direction:column;gap:6px;list-style:none;';
  leftCol.appendChild(legendEl);

  // Right column
  const rightCol = document.createElement('div');
  rightCol.style.cssText = 'min-width:0;';
  grid.appendChild(rightCol);

  const errorEl = document.createElement('span');
  errorEl.style.cssText = 'font-size:0.75rem;color:var(--am-color-error-main);display:none;';
  errorEl.setAttribute('role', 'alert');
  rightCol.appendChild(errorEl);

  const loadingEl = document.createElement('span');
  loadingEl.style.cssText = 'font-size:0.75rem;color:var(--am-color-text-secondary);display:none;';
  loadingEl.setAttribute('aria-live', 'polite');
  rightCol.appendChild(loadingEl);

  const chartHost = document.createElement('div');
  chartHost.style.cssText = 'width:100%;min-height:200px;display:none;';
  rightCol.appendChild(chartHost);

  // Load chart-core element asynchronously
  void (async () => {
    await import('@anytime-markdown/chart-core/element');
    if (destroyed) return;
    const el = document.createElement('anytime-chart') as AnytimeChartElement;
    el.setAttribute('theme', props.isDark ? 'dark' : 'light');
    el.style.width = '100%';
    el.style.height = '200px';
    chartHost.appendChild(el);
    chartEl = el;
    chartReady = true;
    if (props.spec) {
      el.spec = props.spec;
      chartHost.style.display = 'block';
    }
  })();

  function renderLegend(): void {
    legendEl.replaceChildren();
    for (const item of props.legendItems) {
      const li = document.createElement('li');
      li.style.cssText = 'display:flex;align-items:center;gap:8px;';
      const dot = document.createElement('span');
      dot.setAttribute('aria-hidden', 'true');
      dot.style.cssText = `width:10px;height:10px;border-radius:2px;background:${item.color};flex-shrink:0;`;
      const label = document.createElement('span');
      label.style.cssText = 'font-size:0.75rem;line-height:1.2;';
      label.textContent = item.label;
      li.append(dot, label);
      legendEl.appendChild(li);
    }
  }

  function render(): void {
    titleEl.textContent = props.t('c4.trend.title');

    selectHandle.update({
      value: props.period,
      options: [...PERIOD_OPTIONS],
      onChange: (v) => props.onPeriodChange(v),
      ariaLabel: props.t('c4.hotspot.controls.period'),
    });

    renderLegend();

    if (props.error) {
      errorEl.textContent = props.error;
      errorEl.style.display = 'inline';
    } else {
      errorEl.style.display = 'none';
    }

    if (props.loading && !props.spec) {
      loadingEl.textContent = props.t('c4.trend.loading');
      loadingEl.style.display = 'inline';
    } else {
      loadingEl.style.display = 'none';
    }

    if (props.spec) {
      chartHost.style.display = 'block';
      if (chartReady && chartEl) {
        chartEl.spec = props.spec;
        chartEl.setAttribute('theme', props.isDark ? 'dark' : 'light');
      }
    } else {
      chartHost.style.display = 'none';
    }
  }

  render();

  return {
    update(next) {
      props = next;
      render();
    },
    destroy() {
      destroyed = true;
      selectHandle.destroy();
      chartEl?.remove();
      chartEl = null;
      root.remove();
    },
  };
}
