/**
 * Phase 6 S5-C: ドリフト件数の日次推移（折れ線）。
 * 系列は「検知」「解決」「未解決累計」の 3 本。0 件の日はサーバ側で 0 埋め済みのため、
 * ここでは欠測補完をしない（欠測と 0 件の混同を避ける責務はサーバ側に置く）。
 */
import type { ChartSpec } from '@anytime-markdown/chart-core';
import type { DriftHistoryPoint } from '@anytime-markdown/trail-core';
import type { VanillaViewHandle } from '../../shared/vanillaIsland';
import { mountAnytimeChartView } from '../analytics/anytimeChartView';

export interface DriftHistoryChartProps {
  readonly t: (key: string) => string;
  readonly points: readonly DriftHistoryPoint[];
  readonly isDark?: boolean;
}

/** 色は線種・凡例ラベルと併用する（色のみに依存しない） */
const SERIES_COLORS = {
  detected: '#e57373',
  resolved: '#4db6ac',
  unresolved: '#7986cb',
} as const;

export function buildDriftHistorySpec(props: DriftHistoryChartProps): ChartSpec {
  const points = props.points;
  return {
    kind: 'line',
    categories: points.map((p) => p.date),
    series: [
      {
        name: props.t('memory.drift.history.detected'),
        color: SERIES_COLORS.detected,
        connectNulls: true,
        values: points.map((p) => p.detectedCount),
      },
      {
        name: props.t('memory.drift.history.resolved'),
        color: SERIES_COLORS.resolved,
        connectNulls: true,
        values: points.map((p) => p.resolvedCount),
      },
      {
        name: props.t('memory.drift.history.unresolved'),
        color: SERIES_COLORS.unresolved,
        connectNulls: true,
        values: points.map((p) => p.unresolvedCumulative),
      },
    ],
    options: {
      legend: 'bottom',
      yAxis: { label: props.t('memory.drift.history.count') },
    },
  };
}

export function mountDriftHistoryChart(
  container: HTMLElement,
  initial: DriftHistoryChartProps,
): VanillaViewHandle<DriftHistoryChartProps> {
  let props = initial;
  let chartHandle: ReturnType<typeof mountAnytimeChartView> | null = null;
  let emptyMsg: HTMLElement | null = null;

  const root = document.createElement('div');
  root.setAttribute('aria-label', props.t('memory.drift.history.title'));
  root.style.cssText = 'padding:8px 16px;box-sizing:border-box;';
  container.appendChild(root);

  function renderEmpty(): void {
    if (chartHandle) {
      chartHandle.destroy();
      chartHandle = null;
    }
    if (!emptyMsg) {
      emptyMsg = document.createElement('div');
      emptyMsg.style.cssText =
        'padding:8px;font-size:0.75rem;color:var(--am-color-text-secondary);';
      root.appendChild(emptyMsg);
    }
    emptyMsg.textContent = props.t('memory.drift.history.empty');
  }

  function render(): void {
    if (props.points.length === 0) {
      renderEmpty();
      return;
    }
    if (emptyMsg) {
      emptyMsg.remove();
      emptyMsg = null;
    }
    const spec = buildDriftHistorySpec(props);
    if (chartHandle) {
      chartHandle.update({ spec, height: 160, isDark: props.isDark ?? false });
    } else {
      chartHandle = mountAnytimeChartView(root, { spec, height: 160, isDark: props.isDark ?? false });
    }
  }

  render();

  return {
    update(next) {
      props = next;
      render();
    },
    destroy() {
      chartHandle?.destroy();
      chartHandle = null;
      root.remove();
    },
  };
}
