/**
 * vanilla 版 SessionCommitPrefixChart
 * (`components/analytics/charts/SessionCommitPrefixChart.tsx` の素 DOM 等価)。
 */
import { extractCommitPrefix } from '@anytime-markdown/trail-core/domain';
import type { TrailSessionCommit } from '../../../domain/parser/types';
import type { ThemeColors } from '../../../theme/designTokens';
import { buildPieSpec } from '../../../components/analytics/charts/specs/buildPieSpec';
import { mountAnytimeChartView } from '../anytimeChartView';
import { mountChartTitle } from '../charts/shared/chartTitle';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';

export interface SessionCommitPrefixChartProps {
  sessionId: string;
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

export function mountSessionCommitPrefixChart(
  container: HTMLElement,
  initial: SessionCommitPrefixChartProps,
): VanillaViewHandle<SessionCommitPrefixChartProps> {
  let props = initial;
  let cancelled = false;
  let lastSessionId = props.sessionId;

  const card = document.createElement('div');
  applyCardStyle(card, props.cardSx);
  container.appendChild(card);

  const titleHandle = mountChartTitle(card, {
    title: props.t('analytics.commitPrefixChartTitle'),
    description: props.t('analytics.commitPrefixChartTitle.description'),
  });

  const contentEl = document.createElement('div');
  contentEl.style.cssText = 'height:130px;display:flex;align-items:center;justify-content:center;';
  card.appendChild(contentEl);

  let chartHandle: ReturnType<typeof mountAnytimeChartView> | null = null;

  function renderEmpty(): void {
    chartHandle?.destroy();
    chartHandle = null;
    contentEl.innerHTML = '';
    const zero = document.createElement('span');
    zero.style.cssText = `font-size:1.5rem;color:${props.colors.textSecondary};`;
    zero.textContent = '0';
    contentEl.appendChild(zero);
  }

  function renderChart(commits: readonly TrailSessionCommit[]): void {
    chartHandle?.destroy();
    chartHandle = null;
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
    chartHandle = mountAnytimeChartView(contentEl, { spec, height: 130, palette: 'green', isDark: props.isDark });
  }

  async function fetchAndRender(sessionId: string): Promise<void> {
    try {
      const commits = await props.fetchSessionCommits(sessionId);
      if (cancelled || lastSessionId !== sessionId) return;
      if (commits.length === 0) {
        renderEmpty();
      } else {
        renderChart(commits);
      }
    } catch {
      if (!cancelled && lastSessionId === sessionId) renderEmpty();
    }
  }

  renderEmpty();
  void fetchAndRender(props.sessionId);

  return {
    update(next) {
      props = next;
      applyCardStyle(card, next.cardSx);
      titleHandle.update({
        title: next.t('analytics.commitPrefixChartTitle'),
        description: next.t('analytics.commitPrefixChartTitle.description'),
      });
      if (next.sessionId !== lastSessionId) {
        lastSessionId = next.sessionId;
        renderEmpty();
        void fetchAndRender(next.sessionId);
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
