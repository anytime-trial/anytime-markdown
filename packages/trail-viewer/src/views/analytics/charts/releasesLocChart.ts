/**
 * vanilla 版 ReleasesLocChart
 * (`components/analytics/charts/ReleasesLocChart.tsx` の素 DOM 等価)。
 */
import type { ChartSpec } from '@anytime-markdown/chart-core';
import type { TrailRelease } from '@anytime-markdown/trail-core/domain';
import type { ThemeColors } from '../../../theme/designTokens';
import { mountAnytimeChartView } from '../anytimeChartView';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';

export interface ReleasesLocChartProps {
  releases: readonly TrailRelease[];
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
  el.style.padding = '16px';
}

function buildDataset(releases: readonly TrailRelease[]) {
  return [...releases]
    .filter((r) => r.totalLines > 0 && r.releasedAt)
    .sort((a, b) => a.releasedAt.localeCompare(b.releasedAt))
    .map((r) => ({ tag: r.tag, totalLines: r.totalLines, releaseTimeMin: r.releaseTimeMin ?? null }));
}

function buildSpec(props: ReleasesLocChartProps): ChartSpec {
  const dataset = buildDataset(props.releases);
  return {
    kind: 'line',
    categories: dataset.map((d) => d.tag),
    series: [
      {
        name: props.t('releases.totalLoc'),
        color: props.colors.iceBlue,
        connectNulls: true,
        values: dataset.map((d) => d.totalLines),
      },
      {
        name: props.t('releases.releaseTimeMin'),
        color: props.colors.warning,
        axis: 'right',
        connectNulls: true,
        values: dataset.map((d) => d.releaseTimeMin),
      },
    ],
    options: {
      legend: 'bottom',
      yAxis: { label: props.t('releases.totalLoc') },
      yAxisRight: { label: props.t('releases.releaseTimeMin') },
    },
  };
}

export function mountReleasesLocChart(
  container: HTMLElement,
  initial: ReleasesLocChartProps,
): VanillaViewHandle<ReleasesLocChartProps> {
  let props = initial;

  const card = document.createElement('div');
  applyCardStyle(card, props.cardSx);
  container.appendChild(card);

  const dataset = buildDataset(props.releases);

  if (dataset.length === 0) {
    card.style.minHeight = '240px';
    card.style.display = 'flex';
    card.style.alignItems = 'center';
    card.style.justifyContent = 'center';
    const emptyMsg = document.createElement('span');
    emptyMsg.style.cssText = `font-size:0.875rem;color:${props.colors.textSecondary};`;
    emptyMsg.textContent = props.t('releases.noReleases');
    card.appendChild(emptyMsg);

    return {
      update(next) {
        props = next;
        applyCardStyle(card, next.cardSx);
        emptyMsg.style.color = next.colors.textSecondary;
        emptyMsg.textContent = next.t('releases.noReleases');
      },
      destroy() {
        card.remove();
      },
    };
  }

  const chartHandle = mountAnytimeChartView(card, {
    spec: buildSpec(props),
    height: 300,
    isDark: props.isDark,
  });

  return {
    update(next) {
      props = next;
      applyCardStyle(card, next.cardSx);
      chartHandle.update({ spec: buildSpec(next), height: 300, isDark: next.isDark });
    },
    destroy() {
      chartHandle.destroy();
      card.remove();
    },
  };
}
