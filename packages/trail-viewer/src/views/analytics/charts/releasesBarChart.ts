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
  container.appendChild(card);

  // 空⇄非空を render で切替える。mount 時に timeSeries が空でも、非同期到着したら
  // 空メッセージからチャートへ遷移する（旧: 空分岐の update がチャートへ遷移せず固着した回帰の修正）。
  let chartHandle: ReturnType<typeof mountAnytimeChartView> | null = null;
  let emptyMsg: HTMLElement | null = null;

  function render(): void {
    applyCardStyle(card, props.cardSx);
    if (props.timeSeries.length === 0) {
      if (chartHandle) { chartHandle.destroy(); chartHandle = null; }
      card.style.minHeight = '240px';
      card.style.display = 'flex';
      card.style.alignItems = 'center';
      card.style.justifyContent = 'center';
      if (!emptyMsg) { emptyMsg = document.createElement('span'); card.appendChild(emptyMsg); }
      emptyMsg.style.cssText = `font-size:0.875rem;color:${props.colors.textSecondary};`;
      emptyMsg.textContent = props.t('metrics.empty');
      return;
    }
    if (emptyMsg) { emptyMsg.remove(); emptyMsg = null; }
    card.style.minHeight = '';
    card.style.display = '';
    card.style.alignItems = '';
    card.style.justifyContent = '';
    if (!chartHandle) {
      chartHandle = mountAnytimeChartView(card, { spec: buildSpec(props), height: 240, isDark: props.isDark });
    } else {
      chartHandle.update({ spec: buildSpec(props), height: 240, isDark: props.isDark });
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
      card.remove();
    },
  };
}
