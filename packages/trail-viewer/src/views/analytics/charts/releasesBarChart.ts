/**
 * vanilla 版 ReleasesBarChart
 * (`components/analytics/charts/ReleasesBarChart.tsx` の素 DOM 等価)。
 */
import type { ReleaseQualityBucket } from '@anytime-markdown/trail-core/domain/metrics';
import type { ThemeColors } from '../../../theme/designTokens';
import { releaseColors } from '../../../theme/designTokens';
import { buildStackedBarSpec } from '../../../components/analytics/charts/specs/buildStackedBarSpec';
import { mountAnytimeChartView } from '../anytimeChartView';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';

export interface ReleasesBarChartProps {
  timeSeries: ReadonlyArray<ReleaseQualityBucket>;
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

function buildSpec(props: ReleasesBarChartProps) {
  const fmt = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
  });
  const labels = props.timeSeries.map((d) => fmt.format(new Date(d.bucketStart)));
  return buildStackedBarSpec({
    categories: labels,
    series: [
      {
        name: props.t('analytics.combined.releaseSucceeded'),
        values: props.timeSeries.map((d) => d.succeeded),
        color: releaseColors.succeeded,
      },
      {
        name: props.t('analytics.combined.releaseFailed'),
        values: props.timeSeries.map((d) => d.failed),
        color: releaseColors.failed,
      },
    ],
  });
}

export function mountReleasesBarChart(
  container: HTMLElement,
  initial: ReleasesBarChartProps,
): VanillaViewHandle<ReleasesBarChartProps> {
  let props = initial;

  const card = document.createElement('div');
  applyCardStyle(card, props.cardSx);
  container.appendChild(card);

  if (props.timeSeries.length === 0) {
    card.style.minHeight = '240px';
    card.style.display = 'flex';
    card.style.alignItems = 'center';
    card.style.justifyContent = 'center';
    const emptyMsg = document.createElement('span');
    emptyMsg.style.cssText = `font-size:0.875rem;color:${props.colors.textSecondary};`;
    emptyMsg.textContent = props.t('metrics.empty');
    card.appendChild(emptyMsg);

    return {
      update(next) {
        props = next;
        applyCardStyle(card, next.cardSx);
        emptyMsg.style.color = next.colors.textSecondary;
        emptyMsg.textContent = next.t('metrics.empty');
      },
      destroy() {
        card.remove();
      },
    };
  }

  const chartHandle = mountAnytimeChartView(card, {
    spec: buildSpec(props),
    height: 240,
    isDark: props.isDark,
  });

  return {
    update(next) {
      props = next;
      applyCardStyle(card, next.cardSx);
      chartHandle.update({ spec: buildSpec(next), height: 240, isDark: next.isDark });
    },
    destroy() {
      chartHandle.destroy();
      card.remove();
    },
  };
}
