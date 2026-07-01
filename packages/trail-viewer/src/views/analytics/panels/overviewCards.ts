import type { VanillaViewHandle } from '../../../shared/vanillaIsland';
import type { AnalyticsData } from '../../../domain/parser/types';
import type { QualityMetrics } from '@anytime-markdown/trail-core/domain/metrics';
import type { TrailRelease } from '@anytime-markdown/trail-core/domain';
import { fmtNum, fmtTokens, fmtUsd } from '../../../domain/analytics/formatters';
import { formatDoraValue } from '../widgets/doraValueDisplay';
import { mountCyclingCard } from '../widgets/cyclingCard';
import type { VanillaMetricItem } from '../widgets/cyclingCard';
import type { VanillaViewHandle as ChartHandle } from '../../../shared/vanillaIsland';

export interface OverviewCardsProps {
  totals: AnalyticsData['totals'];
  sessions?: readonly import('../../../domain/parser/types').TrailSession[];
  qualityMetrics?: QualityMetrics | null;
  releases?: readonly TrailRelease[];
  cardSx: { bgcolor: string; border: string; borderRadius: string };
  doraColors: Readonly<Record<string, string>>;
  t: (k: string) => string;
}

function fmtMinutes(minutes: number): string {
  return `${Math.round(minutes)}`;
}

function makeDeltaText(deltaPct: number): string {
  const arrow = deltaPct > 0 ? '↑' : deltaPct < 0 ? '↓' : '→';
  return `${arrow} ${Math.abs(deltaPct).toFixed(1)}%`;
}

const DORA_ID_KEYS: Record<string, string> = {
  deploymentFrequency: 'metrics.deploymentFrequency.name',
  leadTimePerLoc: 'metrics.leadTimePerLoc.name',
  tokensPerLoc: 'metrics.tokensPerLoc.name',
  aiFirstTrySuccessRate: 'metrics.aiFirstTrySuccessRate.name',
  changeFailureRate: 'metrics.changeFailureRate.name',
};

const DORA_DESCRIPTION_KEYS: Record<string, string> = {
  deploymentFrequency: 'metrics.deploymentFrequency.description',
  leadTimePerLoc: 'metrics.leadTimePerLoc.description',
  tokensPerLoc: 'metrics.tokensPerLoc.description',
  aiFirstTrySuccessRate: 'metrics.aiFirstTrySuccessRate.description',
  changeFailureRate: 'metrics.changeFailureRate.description',
};

const LEVEL_LABELS: Record<string, string> = {
  elite: 'Elite',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function mountOverviewCards(
  container: HTMLElement,
  props: OverviewCardsProps,
): VanillaViewHandle<OverviewCardsProps> {
  const root = document.createElement('div');
  root.style.cssText = 'display:flex;gap:16px;flex-wrap:wrap;';
  container.appendChild(root);

  let usageIdx = 0;
  let cyclingHandle: ChartHandle<import('../widgets/cyclingCard').CyclingCardProps> | null = null;
  const doraContainers: HTMLElement[] = [];

  function buildUsageCards(p: OverviewCardsProps): VanillaMetricItem[] {
    const totals = p.totals;
    const totalTokens =
      totals.inputTokens +
      totals.outputTokens +
      totals.cacheReadTokens +
      totals.cacheCreationTokens;

    return [
      {
        label: p.t('analytics.linesAdded'),
        value: fmtNum(totals.totalLinesAdded),
        tooltip: p.t('analytics.linesAdded.description'),
        delta:
          totals.comparison?.loc?.deltaPct != null
            ? {
                text: makeDeltaText(totals.comparison.loc.deltaPct),
                color:
                  totals.comparison.loc.deltaPct > 0
                    ? 'success.main'
                    : totals.comparison.loc.deltaPct < 0
                    ? 'error.main'
                    : 'text.secondary',
              }
            : undefined,
      },
      {
        label: p.t('analytics.totalLoc'),
        value: fmtNum(totals.totalLoc),
        tooltip: p.t('analytics.totalLoc.description'),
      },
      {
        label: p.t('analytics.totalTokens'),
        value: fmtTokens(totalTokens),
        tooltip: p.t('analytics.totalTokens.description'),
        delta:
          totals.comparison?.tokens?.deltaPct != null
            ? {
                text: makeDeltaText(totals.comparison.tokens.deltaPct),
                color:
                  totals.comparison.tokens.deltaPct > 0
                    ? 'error.main'
                    : totals.comparison.tokens.deltaPct < 0
                    ? 'success.main'
                    : 'text.secondary',
              }
            : undefined,
      },
      {
        label: p.t('analytics.estimatedCost'),
        value: fmtUsd(totals.estimatedCostUsd),
        tooltip: p.t('analytics.estimatedCost.description'),
        delta:
          totals.comparison?.cost?.deltaPct != null
            ? {
                text: makeDeltaText(totals.comparison.cost.deltaPct),
                color:
                  totals.comparison.cost.deltaPct > 0
                    ? 'error.main'
                    : totals.comparison.cost.deltaPct < 0
                    ? 'success.main'
                    : 'text.secondary',
              }
            : undefined,
      },
      {
        label: p.t('analytics.totalCommits'),
        value: fmtNum(totals.totalCommits),
        tooltip: p.t('analytics.totalCommits.description'),
        delta:
          totals.comparison?.commits?.deltaPct != null
            ? {
                text: makeDeltaText(totals.comparison.commits.deltaPct),
                color:
                  totals.comparison.commits.deltaPct > 0
                    ? 'success.main'
                    : totals.comparison.commits.deltaPct < 0
                    ? 'error.main'
                    : 'text.secondary',
              }
            : undefined,
      },
      {
        label: p.t('analytics.totalSessions'),
        value: fmtNum(totals.sessions),
        tooltip: p.t('analytics.totalSessions.description'),
        delta:
          totals.comparison?.sessions?.deltaPct != null
            ? {
                text: makeDeltaText(totals.comparison.sessions.deltaPct),
                color:
                  totals.comparison.sessions.deltaPct > 0
                    ? 'success.main'
                    : totals.comparison.sessions.deltaPct < 0
                    ? 'error.main'
                    : 'text.secondary',
              }
            : undefined,
      },
    ];
  }

  function renderDoraCard(
    doraContainer: HTMLElement,
    card: {
      primary: string;
      suffix?: string;
      unit?: string;
      label: string;
      tooltip?: string;
      badge?: { label: string; color: string };
      delta?: { text: string; color: string };
    },
    p: OverviewCardsProps,
  ): void {
    doraContainer.innerHTML = '';
    doraContainer.style.cssText = [
      `background-color:${p.cardSx.bgcolor}`,
      `border:${p.cardSx.border}`,
      `border-radius:${p.cardSx.borderRadius}`,
      'flex:1 1 140px',
      'min-width:140px',
      'padding:16px',
      'min-height:150px',
      'text-align:center',
      'display:flex',
      'flex-direction:column',
      'overflow:hidden',
    ].join(';');

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;margin-bottom:4px;gap:4px;';

    const labelEl = document.createElement('span');
    labelEl.style.cssText =
      'font-size:0.75rem;color:var(--am-color-text-secondary);text-align:left;';
    labelEl.textContent = card.label;
    header.appendChild(labelEl);

    if (card.tooltip) {
      const tip = document.createElement('span');
      tip.title = card.tooltip;
      tip.textContent = '?';
      tip.style.cssText =
        'cursor:help;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:14px;height:14px;border:1px solid currentColor;border-radius:50%;color:var(--am-color-text-secondary);font-size:9px;line-height:1;';
      header.appendChild(tip);
    }
    doraContainer.appendChild(header);

    // Value area
    const valueArea = document.createElement('div');
    valueArea.style.cssText =
      'flex:1;display:flex;align-items:center;justify-content:center;';

    const inner = document.createElement('div');
    inner.style.cssText =
      'display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;justify-content:center;';

    const valueEl = document.createElement('span');
    valueEl.style.cssText = 'font-size:1.5rem;font-weight:600;';
    valueEl.textContent = card.primary;
    if (card.suffix) {
      const suffixEl = document.createElement('span');
      suffixEl.style.cssText = 'font-size:0.45em;font-weight:inherit;';
      suffixEl.textContent = card.suffix;
      valueEl.appendChild(suffixEl);
    }
    inner.appendChild(valueEl);

    if (card.unit) {
      const unitEl = document.createElement('span');
      unitEl.style.cssText = 'font-size:0.75rem;color:var(--am-color-text-secondary);';
      unitEl.textContent = card.unit;
      inner.appendChild(unitEl);
    }

    if (card.badge) {
      const badge = document.createElement('span');
      badge.style.cssText = `background-color:${card.badge.color};color:#fff;font-weight:700;font-size:10px;padding:2px 6px;border-radius:10px;display:inline-flex;align-items:center;`;
      badge.textContent = card.badge.label;
      inner.appendChild(badge);
    }

    valueArea.appendChild(inner);
    doraContainer.appendChild(valueArea);

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText =
      'min-height:32px;display:flex;align-items:center;justify-content:center;';

    if (card.delta) {
      const deltaEl = document.createElement('span');
      deltaEl.style.cssText = `font-size:0.75rem;color:${card.delta.color};`;
      deltaEl.textContent = card.delta.text;
      footer.appendChild(deltaEl);
    }
    doraContainer.appendChild(footer);
  }

  function buildDoraCards(p: OverviewCardsProps): Array<{
    primary: string;
    suffix?: string;
    unit?: string;
    label: string;
    tooltip?: string;
    badge?: { label: string; color: string };
    delta?: { text: string; color: string };
  }> {
    const result: ReturnType<typeof buildDoraCards> = [];

    if (p.qualityMetrics) {
      for (const m of Object.values(p.qualityMetrics.metrics)) {
        if (m.sampleSize <= 0 || m.id === 'leadTimePerLoc' || m.id === 'deploymentFrequency') {
          continue;
        }
        const deltaPct = m.comparison?.deltaPct ?? null;
        const formatted = formatDoraValue(m);
        result.push({
          primary: formatted.primary,
          suffix: formatted.suffix,
          unit: formatted.unit,
          label: p.t((DORA_ID_KEYS[m.id] ?? m.id) as Parameters<typeof p.t>[0]),
          tooltip: DORA_DESCRIPTION_KEYS[m.id]
            ? p.t(DORA_DESCRIPTION_KEYS[m.id] as Parameters<typeof p.t>[0])
            : undefined,
          badge: m.level
            ? { label: LEVEL_LABELS[m.level] ?? m.level, color: p.doraColors[m.level] ?? '#888' }
            : undefined,
          delta:
            deltaPct != null
              ? {
                  text: makeDeltaText(deltaPct),
                  color:
                    deltaPct > 0
                      ? 'success.main'
                      : deltaPct < 0
                      ? 'error.main'
                      : 'text.secondary',
                }
              : undefined,
        });
      }
    }

    const measuredReleases = [...(p.releases ?? [])]
      .filter((r) => r.releaseTimeMin != null && r.releaseTimeMin > 0)
      .sort(
        (a, b) => new Date(b.releasedAt).getTime() - new Date(a.releasedAt).getTime(),
      );
    const currentAvgMin = measuredReleases[0]?.releaseTimeMin ?? null;
    const previousAvgMin = measuredReleases[1]?.releaseTimeMin ?? null;
    const releaseTimeDeltaPct =
      currentAvgMin != null && previousAvgMin != null && previousAvgMin > 0
        ? ((currentAvgMin - previousAvgMin) / previousAvgMin) * 100
        : null;
    const releaseTimeLevel =
      currentAvgMin == null
        ? null
        : currentAvgMin < 30
        ? 'elite'
        : currentAvgMin < 60
        ? 'high'
        : currentAvgMin < 120
        ? 'medium'
        : 'low';

    if (currentAvgMin != null) {
      result.push({
        primary: fmtMinutes(currentAvgMin),
        suffix: undefined,
        unit: 'min',
        label: p.t('releases.releaseTimeMin'),
        tooltip: p.t('releases.releaseTimeMin.description'),
        badge: releaseTimeLevel
          ? {
              label: LEVEL_LABELS[releaseTimeLevel] ?? releaseTimeLevel,
              color: p.doraColors[releaseTimeLevel] ?? '#888',
            }
          : undefined,
        delta:
          releaseTimeDeltaPct != null
            ? {
                text: makeDeltaText(releaseTimeDeltaPct),
                color:
                  releaseTimeDeltaPct > 0
                    ? 'error.main'
                    : releaseTimeDeltaPct < 0
                    ? 'success.main'
                    : 'text.secondary',
              }
            : undefined,
      });
    }

    return result;
  }

  function mount(p: OverviewCardsProps): void {
    root.innerHTML = '';
    doraContainers.length = 0;

    // Usage cycling card container
    const cardStyle = {
      ...p.cardSx,
      flex: '1 1 140px',
      p: 2,
      minWidth: 140,
      textAlign: 'center' as const,
      minHeight: '150px',
    };

    const usageCardEl = document.createElement('div');
    usageCardEl.style.cssText = [
      `background-color:${p.cardSx.bgcolor}`,
      `border:${p.cardSx.border}`,
      `border-radius:${p.cardSx.borderRadius}`,
      'flex:1 1 140px',
      'min-width:140px',
      'min-height:150px',
    ].join(';');
    root.appendChild(usageCardEl);

    const usageCards = buildUsageCards(p);
    if (cyclingHandle) {
      cyclingHandle.destroy();
    }
    const cycle = (): void => {
      usageIdx = (usageIdx + 1) % usageCards.length;
      cyclingHandle?.update({
        groupName: p.t('analytics.groupUsage'),
        items: usageCards,
        index: usageIdx,
        onCycle: cycle,
        cardSx: p.cardSx,
      });
    };
    cyclingHandle = mountCyclingCard(usageCardEl, {
      groupName: p.t('analytics.groupUsage'),
      items: usageCards,
      index: usageIdx,
      onCycle: cycle,
      cardSx: p.cardSx,
    });

    void cardStyle;

    // DORA cards
    const doraCards = buildDoraCards(p);
    for (const card of doraCards) {
      const doraEl = document.createElement('div');
      root.appendChild(doraEl);
      doraContainers.push(doraEl);
      renderDoraCard(doraEl, card, p);
    }
  }

  mount(props);

  return {
    update(newProps: OverviewCardsProps) {
      mount(newProps);
    },
    destroy() {
      cyclingHandle?.destroy();
      cyclingHandle = null;
      root.remove();
    },
  };
}
