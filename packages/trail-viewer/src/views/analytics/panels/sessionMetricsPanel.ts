import type { VanillaViewHandle } from '../../../shared/vanillaIsland';
import type { ToolMetrics, TrailSession } from '../../../domain/parser/types';
import {
  fmtNum,
  fmtPercent,
  fmtTokens,
  fmtUsd,
} from '../../../domain/analytics/formatters';
import { sessionCost } from '../../../domain/analytics/calculators';
import { mountCyclingCard } from '../widgets/cyclingCard';
import { SESSION_METRIC_CARD_SIZING } from '../widgets/overviewCardShell';
import type { CyclingCardProps, VanillaMetricItem } from '../widgets/cyclingCard';

export interface SessionMetricsPanelProps {
  session: TrailSession;
  toolMetrics?: ToolMetrics | null;
  cardSx: { bgcolor: string; border: string; borderRadius: string };
  t: (k: string) => string;
}

export function mountSessionMetricsPanel(
  container: HTMLElement,
  props: SessionMetricsPanelProps,
): VanillaViewHandle<SessionMetricsPanelProps> {
  const root = document.createElement('div');
  root.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
  container.appendChild(root);

  let usageIdx = 0;
  let productivityIdx = 0;
  let qualityIdx = 0;

  // CyclingCardProps を手写しすると props 追加のたびに乖離するため実体の型を参照する。
  type CycleHandle = VanillaViewHandle<CyclingCardProps>;

  let usageHandle: CycleHandle | null = null;
  let productivityHandle: CycleHandle | null = null;
  let qualityHandle: CycleHandle | null = null;

  function buildCards(p: SessionMetricsPanelProps): {
    usageCards: VanillaMetricItem[];
    productivityCards: VanillaMetricItem[];
    qualityCards: VanillaMetricItem[];
  } {
    const s = p.session;
    const tm = p.toolMetrics;
    const totalTokens =
      s.usage.inputTokens +
      s.usage.outputTokens +
      s.usage.cacheReadTokens +
      s.usage.cacheCreationTokens;
    const cost = sessionCost(s);
    const turnCount = s.assistantMessageCount ?? s.messageCount;
    const grossLines =
      (s.commitStats?.linesAdded ?? 0) + (s.commitStats?.linesDeleted ?? 0);

    const usageCards: VanillaMetricItem[] = [
      {
        label: p.t('analytics.netLines'),
        value: s.commitStats != null ? fmtNum(grossLines) : '—',
        tooltip: p.t('analytics.netLines.description'),
      },
      {
        label: p.t('analytics.tokens'),
        value: fmtTokens(totalTokens),
        tooltip: p.t('analytics.totalTokens.description'),
      },
      {
        label: p.t('analytics.cost'),
        value: fmtUsd(cost),
        tooltip: p.t('analytics.estimatedCost.description'),
      },
    ];

    const productivityCards: VanillaMetricItem[] = [
      {
        label: p.t('analytics.tokensPerStep'),
        value:
          turnCount > 0
            ? fmtTokens(Math.round(totalTokens / turnCount))
            : '—',
        tooltip: p.t('analytics.tokensPerStep.description'),
      },
      {
        label: p.t('analytics.costPerStep'),
        value: turnCount > 0 ? fmtUsd(cost / turnCount) : '—',
        tooltip: p.t('analytics.costPerStep.description'),
      },
      {
        label: p.t('analytics.tokensPerLoc'),
        value:
          grossLines > 0
            ? fmtNum(Math.round(totalTokens / grossLines))
            : '—',
        tooltip: p.t('analytics.tokensPerLoc.description'),
      },
    ];

    const qualityCards: VanillaMetricItem[] = [
      {
        label: p.t('analytics.retryRate'),
        value:
          tm && tm.totalEdits > 0
            ? fmtPercent(tm.totalRetries / tm.totalEdits)
            : '—',
        tooltip: p.t('analytics.retryRate.description'),
      },
      {
        label: p.t('analytics.buildFail'),
        value:
          tm && tm.totalBuildRuns > 0
            ? fmtPercent(tm.totalBuildFails / tm.totalBuildRuns)
            : '—',
        tooltip: p.t('analytics.buildFail.description'),
      },
      {
        label: p.t('analytics.testFail'),
        value:
          tm && tm.totalTestRuns > 0
            ? fmtPercent(tm.totalTestFails / tm.totalTestRuns)
            : '—',
        tooltip: p.t('analytics.testFail.description'),
      },
    ];

    return { usageCards, productivityCards, qualityCards };
  }

  function mount(p: SessionMetricsPanelProps): void {
    // Destroy old handles
    usageHandle?.destroy();
    productivityHandle?.destroy();
    qualityHandle?.destroy();
    usageHandle = null;
    productivityHandle = null;
    qualityHandle = null;
    root.innerHTML = '';

    const { usageCards, productivityCards, qualityCards } = buildCards(p);

    // 寸法（旧 cardStyle: minWidth:160 / flex:'1 1 160px' / textAlign:center）は
    // ラッパーではなくカード本体へ渡す。ラッパーへ寸法・内側へ装飾と分けると、装飾を
    // 持つ要素が高さを持たず隣のカードと揃わなくなる（overviewCards で起きた不具合）。
    const cardExtraStyles = ['text-align:center'] as const;
    const cycleUsage = (): void => {
      usageIdx = (usageIdx + 1) % usageCards.length;
      usageHandle?.update({
        groupName: p.t('analytics.groupUsage'),
        items: usageCards,
        index: usageIdx,
        onCycle: cycleUsage,
        cardSx: p.cardSx,
        sizing: SESSION_METRIC_CARD_SIZING,
        extraStyles: cardExtraStyles,
      });
    };
    usageHandle = mountCyclingCard(root, {
      groupName: p.t('analytics.groupUsage'),
      items: usageCards,
      index: usageIdx,
      onCycle: cycleUsage,
      cardSx: p.cardSx,
      sizing: SESSION_METRIC_CARD_SIZING,
      extraStyles: cardExtraStyles,
    });

    const cycleProductivity = (): void => {
      productivityIdx = (productivityIdx + 1) % productivityCards.length;
      productivityHandle?.update({
        groupName: p.t('analytics.groupProductivity'),
        items: productivityCards,
        index: productivityIdx,
        onCycle: cycleProductivity,
        cardSx: p.cardSx,
        sizing: SESSION_METRIC_CARD_SIZING,
        extraStyles: cardExtraStyles,
      });
    };
    productivityHandle = mountCyclingCard(root, {
      groupName: p.t('analytics.groupProductivity'),
      items: productivityCards,
      index: productivityIdx,
      onCycle: cycleProductivity,
      cardSx: p.cardSx,
      sizing: SESSION_METRIC_CARD_SIZING,
      extraStyles: cardExtraStyles,
    });

    const cycleQuality = (): void => {
      qualityIdx = (qualityIdx + 1) % qualityCards.length;
      qualityHandle?.update({
        groupName: p.t('analytics.groupQuality'),
        items: qualityCards,
        index: qualityIdx,
        onCycle: cycleQuality,
        cardSx: p.cardSx,
        sizing: SESSION_METRIC_CARD_SIZING,
        extraStyles: cardExtraStyles,
      });
    };
    qualityHandle = mountCyclingCard(root, {
      groupName: p.t('analytics.groupQuality'),
      items: qualityCards,
      index: qualityIdx,
      onCycle: cycleQuality,
      cardSx: p.cardSx,
      sizing: SESSION_METRIC_CARD_SIZING,
      extraStyles: cardExtraStyles,
    });
  }

  mount(props);

  return {
    update(newProps: SessionMetricsPanelProps) {
      mount(newProps);
    },
    destroy() {
      usageHandle?.destroy();
      productivityHandle?.destroy();
      qualityHandle?.destroy();
      usageHandle = null;
      productivityHandle = null;
      qualityHandle = null;
      root.remove();
    },
  };
}
