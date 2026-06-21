/**
 * vanilla 版 DayCommitPrefixChart
 * (`components/analytics/charts/DayCommitPrefixChart.tsx` の素 DOM 等価)。
 * 非同期でコミットデータを取得し、内部で loading 状態を管理する。
 */
import { extractCommitPrefix } from '@anytime-markdown/trail-core/domain';
import type { TrailSessionCommit } from '../../../domain/parser/types';
import type { ThemeColors } from '../../../theme/designTokens';
import { buildPieSpec } from '../../../components/analytics/charts/specs/buildPieSpec';
import { mountAnytimeChartView } from '../anytimeChartView';
import { mountChartTitle } from '../charts/shared/chartTitle';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';

export interface DayCommitPrefixChartProps {
  sessionIds: readonly string[];
  fetchSessionCommits: (id: string) => Promise<readonly TrailSessionCommit[]>;
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

export function mountDayCommitPrefixChart(
  container: HTMLElement,
  initial: DayCommitPrefixChartProps,
): VanillaViewHandle<DayCommitPrefixChartProps> {
  let props = initial;
  let cancelled = false;

  const card = document.createElement('div');
  applyCardStyle(card, props.cardSx);
  container.appendChild(card);

  // ChartTitle
  const titleHandle = mountChartTitle(card, {
    title: props.t('analytics.commitPrefixChartTitle'),
    description: props.t('analytics.commitPrefixChartTitle.description'),
  });

  // Content area (either empty state or chart)
  let contentEl = document.createElement('div');
  contentEl.style.cssText = `height:130px;display:flex;align-items:center;justify-content:center;`;
  card.appendChild(contentEl);

  let chartHandle: VanillaViewHandle<{ spec: ReturnType<typeof buildPieSpec>; height: number; palette: string; isDark: boolean }> | null = null;

  function renderEmpty(): void {
    if (chartHandle) {
      chartHandle.destroy();
      chartHandle = null;
    }
    contentEl.innerHTML = '';
    const zero = document.createElement('span');
    zero.style.cssText = `font-size:1.5rem;color:${props.colors.textSecondary};`;
    zero.textContent = '0';
    contentEl.appendChild(zero);
  }

  function renderChart(commits: readonly TrailSessionCommit[]): void {
    if (chartHandle) {
      chartHandle.destroy();
      chartHandle = null;
    }
    contentEl.innerHTML = '';

    const prefixCounts = new Map<string, number>();
    for (const c of commits) {
      const subject = (c.commitMessage ?? '').split('\n')[0];
      const prefix = extractCommitPrefix(subject);
      prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
    }
    const sorted = [...prefixCounts.entries()].sort(([, a], [, b]) => b - a);
    const spec = buildPieSpec(
      sorted.map(([prefix, count]) => ({ label: `${prefix} (${count})`, value: count })),
    );

    chartHandle = mountAnytimeChartView(contentEl, {
      spec,
      height: 130,
      palette: 'green',
      isDark: props.isDark,
    }) as VanillaViewHandle<{ spec: ReturnType<typeof buildPieSpec>; height: number; palette: string; isDark: boolean }>;
  }

  // Async fetch
  const sessionIdsKey = props.sessionIds.join(',');
  let lastFetchKey = sessionIdsKey;

  async function fetchAndRender(sessionIds: readonly string[]): Promise<void> {
    try {
      const results = await Promise.all(sessionIds.map((id) => props.fetchSessionCommits(id)));
      if (cancelled) return;
      const commits = results.flat();
      if (commits.length === 0) {
        renderEmpty();
      } else {
        renderChart(commits);
      }
    } catch {
      if (!cancelled) renderEmpty();
    }
  }

  // Start with empty state visually
  renderEmpty();
  void fetchAndRender(props.sessionIds);

  return {
    update(next) {
      props = next;
      applyCardStyle(card, next.cardSx);
      titleHandle.update({
        title: next.t('analytics.commitPrefixChartTitle'),
        description: next.t('analytics.commitPrefixChartTitle.description'),
      });
      const nextKey = next.sessionIds.join(',');
      if (nextKey !== lastFetchKey) {
        lastFetchKey = nextKey;
        renderEmpty();
        void fetchAndRender(next.sessionIds);
      }
    },
    destroy() {
      cancelled = true;
      chartHandle?.destroy();
      titleHandle.destroy();
      card.remove();
    },
  };
}
