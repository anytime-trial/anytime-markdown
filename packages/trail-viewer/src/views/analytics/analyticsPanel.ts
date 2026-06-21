/**
 * Vanilla mount for AnalyticsPanel.
 * Owns period state, quality-metrics fetch effect, and comparison computation.
 * Composes mountOverviewCards / mountToolUsageChart / mountCombinedChartsSection directly.
 */
import type { VanillaViewHandle } from '../../shared/vanillaIsland';
import type { AnalyticsPanelProps, PeriodDays } from '../../components/analytics/types';
import type { QualityMetrics } from '@anytime-markdown/trail-core/domain/metrics';
import type { TrailThemeTokens } from '../../theme/designTokens';
import type { CombinedChartsContentThemeProps } from './charts/combined/combinedChartsContent';
// Inline types mirroring the context value shapes (context interfaces are not exported)
interface ToolCategoryContextValue {
  getToolCategory: (toolName: string) => number;
  getToolCategoryColor: (toolName: string) => string;
  getToolCategoryLabel: (cat: number) => string;
  getToolCategoryColorByIndex: (cat: number) => string;
  toolCategoryKeys: readonly number[];
}
interface SkillCategoryContextValue {
  getSkillCategory: (skillName: string) => number;
  getSkillCategoryColor: (skillName: string) => string;
  getSkillCategoryLabel: (cat: number) => string;
  getSkillCategoryColorByIndex: (cat: number) => string;
  skillCategoryKeys: readonly number[];
}
interface CommitCategoryContextValue {
  getCategoryColor: (prefix: string) => string;
  getCategory: (prefix: string) => number;
  getCategoryLabel: (cat: number) => string;
  getCategoryColorByIndex: (cat: number) => string;
  categoryKeys: readonly number[];
}
import { mountOverviewCards } from './panels/overviewCards';
import { mountToolUsageChart } from './charts/toolUsageChart';
import { mountCombinedChartsSection } from './panels/combinedChartsSection';

// ---------------------------------------------------------------------------
// Props contract
// ---------------------------------------------------------------------------

export interface AnalyticsPanelViewProps extends AnalyticsPanelProps {
  /** Resolved from useTrailTheme() */
  tokens: TrailThemeTokens;
  /** Resolved from useTrailI18n(): t */
  t: (k: string) => string;
  /** Resolved from useToolCategory() */
  toolCategory: ToolCategoryContextValue;
  /** Resolved from useSkillCategory() */
  skillCategory: SkillCategoryContextValue;
  /** Resolved from useCommitCategory() */
  commitCategory: CommitCategoryContextValue;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Port of useMemo comparison from AnalyticsPanel.tsx — verbatim. */
function computeComparison(
  analytics: AnalyticsPanelProps['analytics'],
):
  | {
      sessions: { deltaPct: number | null };
      tokens: { deltaPct: number | null };
      cost: { deltaPct: number | null };
      commits: { deltaPct: number | null };
      loc: { deltaPct: number | null };
    }
  | undefined {
  if (!analytics) return undefined;
  const FIXED_DAYS = 30;
  const now = new Date();
  const currentFrom = new Date(now.getTime() - FIXED_DAYS * 86_400_000);
  const previousFrom = new Date(currentFrom.getTime() - FIXED_DAYS * 86_400_000);
  const current = { sessions: 0, tokens: 0, cost: 0, commits: 0, loc: 0 };
  const previous = { sessions: 0, tokens: 0, cost: 0, commits: 0, loc: 0 };
  for (const d of analytics.dailyActivity) {
    const date = new Date(d.date);
    if (date >= currentFrom) {
      current.sessions += d.sessions;
      current.tokens += d.inputTokens + d.outputTokens;
      current.cost += d.estimatedCostUsd;
      current.commits += d.commits;
      current.loc += d.linesAdded + (d.linesDeleted ?? 0);
    } else if (date >= previousFrom) {
      previous.sessions += d.sessions;
      previous.tokens += d.inputTokens + d.outputTokens;
      previous.cost += d.estimatedCostUsd;
      previous.commits += d.commits;
      previous.loc += d.linesAdded + (d.linesDeleted ?? 0);
    }
  }
  const delta = (cur: number, prev: number): number | null =>
    prev > 0 ? ((cur - prev) / prev) * 100 : null;
  return {
    sessions: { deltaPct: delta(current.sessions, previous.sessions) },
    tokens: { deltaPct: delta(current.tokens, previous.tokens) },
    cost: { deltaPct: delta(current.cost, previous.cost) },
    commits: { deltaPct: delta(current.commits, previous.commits) },
    loc: { deltaPct: delta(current.loc, previous.loc) },
  };
}

function buildCombinedTheme(p: AnalyticsPanelViewProps): CombinedChartsContentThemeProps {
  const { tokens, t, toolCategory, skillCategory, commitCategory } = p;
  return {
    isDark: tokens.isDark,
    toolPalette: tokens.toolPalette,
    cardSx: tokens.cardSx,
    t,
    getToolCategory: toolCategory.getToolCategory,
    getToolCategoryLabel: toolCategory.getToolCategoryLabel,
    getToolCategoryColorByIndex: toolCategory.getToolCategoryColorByIndex,
    toolCategoryKeys: toolCategory.toolCategoryKeys,
    getSkillCategory: skillCategory.getSkillCategory,
    getSkillCategoryLabel: skillCategory.getSkillCategoryLabel,
    getSkillCategoryColorByIndex: skillCategory.getSkillCategoryColorByIndex,
    skillCategoryKeys: skillCategory.skillCategoryKeys,
    getCategory: commitCategory.getCategory,
    getCategoryLabel: commitCategory.getCategoryLabel,
    getCategoryColorByIndex: commitCategory.getCategoryColorByIndex,
    categoryKeys: commitCategory.categoryKeys,
  };
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

export function mountAnalyticsPanel(
  container: HTMLElement,
  props: AnalyticsPanelViewProps,
): VanillaViewHandle<AnalyticsPanelViewProps> {
  let destroyed = false;

  // Internal state
  let period: PeriodDays = 30;
  let overviewQualityMetrics: QualityMetrics | null = null;

  // Root scroll container (mirrors the MUI Box styling)
  const root = document.createElement('div');
  root.style.cssText = 'overflow:auto;flex:1;padding:16px;display:flex;flex-direction:column;gap:24px;';
  container.appendChild(root);

  // Loading placeholder element (shown when analytics is null)
  const loadingEl = document.createElement('div');
  loadingEl.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;';
  const loadingText = document.createElement('span');
  loadingText.style.cssText = 'font-size:0.875rem;color:var(--am-color-text-secondary);';
  loadingEl.appendChild(loadingText);

  // Sub-mount containers
  const overviewContainer = document.createElement('div');
  const toolUsageContainer = document.createElement('div');
  const combinedContainer = document.createElement('div');

  // Sub-mount handles
  let overviewHandle: VanillaViewHandle<Parameters<typeof mountOverviewCards>[1]> | null = null;
  let toolUsageHandle: VanillaViewHandle<Parameters<typeof mountToolUsageChart>[1]> | null = null;
  let combinedHandle: VanillaViewHandle<Parameters<typeof mountCombinedChartsSection>[1]> | null = null;

  // Whether the sub-mounts are currently attached (i.e. analytics was non-null)
  let subMountsAttached = false;

  function applyScrollbarStyle(p: AnalyticsPanelViewProps): void {
    const sx = p.tokens.scrollbarSx as Record<string, string>;
    for (const [k, v] of Object.entries(sx)) {
      if (k.startsWith('&') || k.startsWith(':')) continue; // skip selectors
      (root.style as unknown as Record<string, string>)[k] = v;
    }
  }

  function mountSubViews(p: AnalyticsPanelViewProps): void {
    if (!p.analytics) return;

    const { tokens, t } = p;
    const comparison = computeComparison(p.analytics);

    // OverviewCards
    const overviewProps = {
      totals: { ...p.analytics.totals, comparison },
      sessions: p.sessions ?? [],
      qualityMetrics: overviewQualityMetrics,
      releases: p.releases,
      cardSx: tokens.cardSx,
      doraColors: tokens.doraColors as unknown as Readonly<Record<string, string>>,
      t,
    };
    if (overviewHandle) {
      overviewHandle.update(overviewProps);
    } else {
      overviewHandle = mountOverviewCards(overviewContainer, overviewProps);
    }

    // ToolUsageChart
    const toolUsageProps = {
      items: p.analytics.toolUsage,
      chartColors: tokens.chartColors,
      radius: tokens.radius,
      t,
    };
    if (toolUsageHandle) {
      toolUsageHandle.update(toolUsageProps);
    } else {
      toolUsageHandle = mountToolUsageChart(toolUsageContainer, toolUsageProps);
    }

    // CombinedChartsSection
    const combinedProps = {
      dailyActivity: p.analytics.dailyActivity,
      releases: p.releases,
      sessions: p.sessions ?? [],
      sessionsLoading: p.sessionsLoading,
      period,
      setPeriod: (v: PeriodDays) => {
        period = v;
        renderContent(currentProps);
      },
      onSelectSession: p.onSelectSession,
      onJumpToTrace: p.onJumpToTrace,
      fetchSessionMessages: p.fetchSessionMessages,
      fetchSessionCommits: p.fetchSessionCommits,
      fetchSessionToolMetrics: p.fetchSessionToolMetrics,
      fetchDayToolMetrics: p.fetchDayToolMetrics,
      costOptimization: p.costOptimization,
      fetchCombinedData: p.fetchCombinedData,
      fetchQualityMetrics: p.fetchQualityMetrics,
      fetchReleaseQuality: p.fetchReleaseQuality,
      onOpenReleasesPopup: p.onOpenReleasesPopup,
      onOpenPromptsPopup: p.onOpenPromptsPopup,
      onOpenMessagesPopup: p.onOpenMessagesPopup,
      colors: tokens.colors,
      chartColors: tokens.chartColors,
      cardSx: tokens.cardSx,
      isDark: tokens.isDark,
      toolPalette: tokens.toolPalette,
      t,
      combinedTheme: buildCombinedTheme(p),
    };
    if (combinedHandle) {
      combinedHandle.update(combinedProps);
    } else {
      combinedHandle = mountCombinedChartsSection(combinedContainer, combinedProps);
    }
  }

  function destroySubViews(): void {
    overviewHandle?.destroy();
    overviewHandle = null;
    toolUsageHandle?.destroy();
    toolUsageHandle = null;
    combinedHandle?.destroy();
    combinedHandle = null;
  }

  // Keep track of current props for use in setPeriod closure
  let currentProps: AnalyticsPanelViewProps = props;

  function renderContent(p: AnalyticsPanelViewProps): void {
    currentProps = p;
    applyScrollbarStyle(p);

    if (!p.analytics) {
      // Show loading state
      if (subMountsAttached) {
        destroySubViews();
        overviewContainer.remove();
        toolUsageContainer.remove();
        combinedContainer.remove();
        subMountsAttached = false;
      }
      loadingText.textContent = p.t('analytics.loadingAnalytics');
      if (!loadingEl.parentElement) {
        root.appendChild(loadingEl);
      }
    } else {
      // Hide loading, show sub-mounts
      loadingEl.remove();
      if (!subMountsAttached) {
        root.appendChild(overviewContainer);
        root.appendChild(toolUsageContainer);
        root.appendChild(combinedContainer);
        subMountsAttached = true;
      }
      mountSubViews(p);
    }
  }

  // Initial quality-metrics fetch (mirrors useEffect([fetchQualityMetrics]))
  if (props.fetchQualityMetrics) {
    const to = new Date();
    const from = new Date(0);
    void props.fetchQualityMetrics({ from: from.toISOString(), to: to.toISOString() }).then(
      (result) => {
        if (destroyed) return;
        if (result) {
          overviewQualityMetrics = result;
          // Re-render overview cards with updated quality metrics
          if (overviewHandle && currentProps.analytics) {
            const { tokens, t } = currentProps;
            const comparison = computeComparison(currentProps.analytics);
            overviewHandle.update({
              totals: { ...currentProps.analytics.totals, comparison },
              sessions: currentProps.sessions ?? [],
              qualityMetrics: overviewQualityMetrics,
              releases: currentProps.releases,
              cardSx: tokens.cardSx,
              doraColors: tokens.doraColors as unknown as Readonly<Record<string, string>>,
              t,
            });
          }
        }
      },
    );
  }

  renderContent(props);

  return {
    update(newProps: AnalyticsPanelViewProps) {
      // Re-trigger quality metrics fetch only if fetchQualityMetrics reference changed
      if (newProps.fetchQualityMetrics !== currentProps.fetchQualityMetrics) {
        overviewQualityMetrics = null;
        if (newProps.fetchQualityMetrics) {
          const to = new Date();
          const from = new Date(0);
          void newProps.fetchQualityMetrics({ from: from.toISOString(), to: to.toISOString() }).then(
            (result) => {
              if (destroyed) return;
              if (result) {
                overviewQualityMetrics = result;
                if (overviewHandle && currentProps.analytics) {
                  const { tokens, t } = currentProps;
                  const comparison = computeComparison(currentProps.analytics);
                  overviewHandle.update({
                    totals: { ...currentProps.analytics.totals, comparison },
                    sessions: currentProps.sessions ?? [],
                    qualityMetrics: overviewQualityMetrics,
                    releases: currentProps.releases,
                    cardSx: tokens.cardSx,
                    doraColors: tokens.doraColors as unknown as Readonly<Record<string, string>>,
                    t,
                  });
                }
              }
            },
          );
        }
      }
      renderContent(newProps);
    },
    destroy() {
      destroyed = true;
      destroySubViews();
      root.remove();
    },
  };
}
