/**
 * PipelineRunsTimeline の vanilla DOM 版。
 * pipeline 実行統計を日次スタック棒グラフ（anytime-chart WC）で表示する。
 */
import type { VanillaViewHandle } from '../../shared/vanillaIsland';
import type { MemoryPipelineRunStatsByDayRow } from '../../data/types';
import { buildStackedChartData } from '../../components/memory/pipelineChartData';
import { buildStackedBarSpec } from '../../components/analytics/charts/specs/buildStackedBarSpec';
/** anytime-chart カスタム要素に `.spec` を設定するための最小型。 */
interface AnytimeChartElement extends HTMLElement {
  spec: unknown;
}

export interface PipelineRunsTimelineProps {
  readonly t: (key: string) => string;
  readonly rows: readonly MemoryPipelineRunStatsByDayRow[];
  /** ダークモード。省略時は false。 */
  readonly isDark?: boolean;
}

/** scope 名から決定論的な色を返す（bugCausalPanel 等の scope パレット準拠）。 */
function scopeColor(scope: string): string {
  const PALETTE = [
    '#4e8ed4',
    '#4db6ac',
    '#f4a261',
    '#a78bfa',
    '#fb923c',
    '#34d399',
    '#f87171',
    '#60a5fa',
  ];
  let hash = 0;
  for (let i = 0; i < scope.length; i++) {
    hash = (hash * 31 + scope.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export function mountPipelineRunsTimeline(
  container: HTMLElement,
  initial: PipelineRunsTimelineProps,
): VanillaViewHandle<PipelineRunsTimelineProps> {
  let props = initial;
  let chartEl: AnytimeChartElement | null = null;
  let cancelled = false;

  const root = document.createElement('div');
  root.setAttribute('aria-label', props.t('memory.runs.timeline'));
  root.style.cssText = 'height:160px;padding:0 8px;box-sizing:border-box;';
  container.appendChild(root);

  const emptyEl = document.createElement('div');
  emptyEl.style.cssText =
    'height:100%;display:flex;align-items:center;justify-content:center;font-size:0.75rem;color:var(--am-color-text-secondary);';
  emptyEl.textContent = props.t('memory.runs.empty');

  function buildSpec(rows: readonly MemoryPipelineRunStatsByDayRow[]) {
    const { xLabels, series } = buildStackedChartData(rows);
    return buildStackedBarSpec({
      categories: [...xLabels],
      series: series.map((s) => ({ name: s.scope, values: [...s.data], color: scopeColor(s.scope) })),
      yAxisLabel: 'sec',
    });
  }

  function renderEmpty(): void {
    chartEl?.remove();
    chartEl = null;
    if (!emptyEl.isConnected) root.appendChild(emptyEl);
  }

  function renderChart(rows: readonly MemoryPipelineRunStatsByDayRow[]): void {
    if (emptyEl.isConnected) emptyEl.remove();
    const spec = buildSpec(rows);
    if (chartEl) {
      chartEl.spec = spec;
      chartEl.setAttribute('theme', props.isDark ? 'dark' : 'light');
    } else {
      void (async () => {
        await import('@anytime-markdown/chart-core/element');
        if (cancelled) return;
        const el = document.createElement('anytime-chart') as AnytimeChartElement;
        el.setAttribute('theme', props.isDark ? 'dark' : 'light');
        el.style.width = '100%';
        el.style.height = '150px';
        root.appendChild(el);
        el.spec = spec;
        chartEl = el;
      })();
    }
  }

  function render(): void {
    if (props.rows.length === 0) {
      renderEmpty();
    } else {
      renderChart(props.rows);
    }
  }

  render();

  return {
    update(next) {
      props = next;
      render();
    },
    destroy() {
      cancelled = true;
      chartEl?.remove();
      chartEl = null;
      root.remove();
    },
  };
}
