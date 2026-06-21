import type { VanillaViewHandle } from '../../../shared/vanillaIsland';
import type {
  AnalyticsData,
  CombinedData,
  CombinedPeriodMode,
  CombinedRangeDays,
  CostOptimizationData,
  ToolMetrics,
  TrailMessage,
  TrailSession,
  TrailSessionCommit,
} from '../../../domain/parser/types';
import type {
  DateRange,
  QualityMetrics,
  ReleaseQualityBucket,
} from '@anytime-markdown/trail-core/domain/metrics';
import type { TrailRelease } from '@anytime-markdown/trail-core/domain';
import type {
  AgentMetric,
  ChartMetric,
  CombinedMetric,
  CommitMetric,
  DailyViewMode,
  PeriodDays,
  ToolChartMetric,
} from '../../../components/analytics/types';
import type { ThemeColors, ThemeChartColors } from '../../../theme/designTokens';
import { mountDailyActivityChart } from '../charts/dailyActivityChart';
import { mountReleasesLocChart } from '../charts/releasesLocChart';
import {
  mountCombinedChartsContent,
  type CombinedChartsContentThemeProps,
} from '../charts/combined/combinedChartsContent';
import { mountDailySessionList } from './dailySessionList';

export interface CombinedChartsSectionProps {
  dailyActivity: AnalyticsData['dailyActivity'];
  releases?: readonly TrailRelease[];
  sessions: readonly TrailSession[];
  sessionsLoading?: boolean;
  period: PeriodDays;
  setPeriod: (v: PeriodDays) => void;
  onSelectSession?: (id: string) => void;
  onJumpToTrace?: (session: TrailSession) => void;
  fetchSessionMessages?: (id: string) => Promise<readonly TrailMessage[]>;
  fetchSessionCommits?: (id: string) => Promise<readonly TrailSessionCommit[]>;
  fetchSessionToolMetrics?: (id: string) => Promise<ToolMetrics | null>;
  fetchDayToolMetrics?: (date: string) => Promise<ToolMetrics | null>;
  costOptimization?: CostOptimizationData | null;
  fetchCombinedData?: (
    period: CombinedPeriodMode,
    rangeDays: CombinedRangeDays,
  ) => Promise<CombinedData>;
  fetchQualityMetrics?: (range: DateRange) => Promise<QualityMetrics | null>;
  fetchReleaseQuality?: (
    range: DateRange,
    bucket: 'day' | 'week',
  ) => Promise<ReadonlyArray<ReleaseQualityBucket>>;
  onOpenReleasesPopup?: () => void;
  onOpenPromptsPopup?: () => void;
  onOpenMessagesPopup?: () => void;
  // Theme
  colors: ThemeColors;
  chartColors: ThemeChartColors;
  cardSx: { bgcolor: string; border: string; borderRadius: string };
  isDark: boolean;
  toolPalette: readonly string[];
  t: (k: string) => string;
  // Category functions for CombinedChartsContent
  combinedTheme: CombinedChartsContentThemeProps;
}

type AnyHandle = VanillaViewHandle<object>;

const METRICS: CombinedMetric[] = [
  'tokens',
  'agents',
  'models',
  'skills',
  'tools',
  'repos',
  'commits',
  'releases',
];

const PERIODS: PeriodDays[] = [7, 30, 90];

export function mountCombinedChartsSection(
  container: HTMLElement,
  props: CombinedChartsSectionProps,
): VanillaViewHandle<CombinedChartsSectionProps> {
  const root = document.createElement('div');
  container.appendChild(root);

  // Mutable state
  let metric: CombinedMetric = 'tokens';
  let tokenMode: DailyViewMode = 'tokens';
  let toolMetric: ToolChartMetric = 'count';
  let modelMetric: ChartMetric = 'count';
  let agentMetric: AgentMetric = 'tokens';
  let commitMetric: CommitMetric = 'count';
  let repoMetric: ChartMetric = 'count';
  let combinedData: CombinedData | null = null;
  let combinedLoading = false;
  let overlay: {
    bucket: 'day' | 'week';
    tokens: ReadonlyArray<{ bucketStart: string; value: number }>;
    cost: ReadonlyArray<{ bucketStart: string; value: number }>;
    leadTime: ReadonlyArray<{ bucketStart: string; value: number }>;
    leadTimePerLoc: ReadonlyArray<{ bucketStart: string; value: number }>;
    leadTimeUnmapped: ReadonlyArray<{ bucketStart: string; value: number }>;
    leadTimeByPrefix: {
      prefixes: ReadonlyArray<string>;
      series: ReadonlyArray<{ bucketStart: string; byPrefix: Readonly<Record<string, number>> }>;
    };
    deploymentFrequency: ReadonlyArray<{ bucketStart: string; value: number }>;
  } | null = null;
  let selectedDate: string | null = null;
  let combinedFetchCancelled = false;
  let overlayFetchCancelled = false;

  let currentProps = props;

  const chartHandles: AnyHandle[] = [];

  function destroyCharts(): void {
    for (const h of chartHandles) {
      h.destroy();
    }
    chartHandles.length = 0;
  }

  function createToggleBtn(label: string, value: string, currentVal: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.dataset['value'] = value;
    btn.style.cssText = [
      'padding:4px 10px',
      'font-size:0.8rem',
      'border:1px solid',
      'cursor:pointer',
      'background:none',
      value === currentVal
        ? `border-color:${currentProps.colors.iceBlue};color:${currentProps.colors.iceBlue};background-color:${currentProps.colors.iceBlueBg};`
        : `border-color:${currentProps.colors.border};color:${currentProps.colors.textSecondary};`,
    ].join(';');
    return btn;
  }

  function createBtnGroup(
    parent: HTMLElement,
    values: readonly string[],
    labels: readonly string[],
    currentVal: string,
    onChange: (v: string) => void,
  ): void {
    const group = document.createElement('div');
    group.style.cssText = 'display:inline-flex;border-radius:4px;overflow:hidden;';
    for (let i = 0; i < values.length; i++) {
      const btn = createToggleBtn(labels[i] ?? values[i] ?? '', values[i] ?? '', currentVal);
      btn.addEventListener('click', () => onChange(values[i] ?? ''));
      group.appendChild(btn);
    }
    parent.appendChild(group);
  }

  function renderToolbar(p: CombinedChartsSectionProps): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;flex-wrap:wrap;';

    const leftGroup = document.createElement('div');
    leftGroup.style.cssText =
      'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';

    // Main metric selector
    const metricLabels = [
      p.t('chart.tokenUsage'),
      p.t('analytics.combined.agent'),
      p.t('analytics.combined.model'),
      p.t('analytics.combined.skill'),
      p.t('analytics.combined.tool'),
      p.t('analytics.combined.repository'),
      p.t('analytics.combined.commitPrefix'),
      p.t('analytics.combined.release'),
    ];
    createBtnGroup(leftGroup, METRICS, metricLabels, metric, (v) => {
      metric = v as CombinedMetric;
      if (v === 'releases') selectedDate = null;
      render(currentProps);
    });

    // Period selector (not for releases)
    if (metric !== 'releases') {
      const periodGroup = document.createElement('div');
      periodGroup.style.cssText = 'display:inline-flex;border-radius:4px;overflow:hidden;';
      for (const pd of PERIODS) {
        const btn = createToggleBtn(
          `${pd}${p.t('releases.days')}`,
          String(pd),
          String(p.period),
        );
        btn.addEventListener('click', () => {
          selectedDate = null;
          p.setPeriod(pd);
        });
        periodGroup.appendChild(btn);
      }
      leftGroup.appendChild(periodGroup);
    }

    toolbar.appendChild(leftGroup);

    // Right: sub-metric toggles
    const rightGroup = document.createElement('div');
    rightGroup.style.cssText = 'display:inline-flex;align-items:center;gap:8px;';

    if (metric === 'tokens') {
      const tokenModes: DailyViewMode[] = ['tokens', 'cost'];
      const tokenModeLabels = [p.t('chart.tokens'), p.t('chart.cost')];
      createBtnGroup(rightGroup, tokenModes, tokenModeLabels, tokenMode, (v) => {
        tokenMode = v as DailyViewMode;
        render(currentProps);
      });
    } else if (metric === 'tools') {
      const toolMetrics: ToolChartMetric[] = ['count', 'tokens', 'error'];
      const toolMetricLabels = [
        p.t('analytics.combined.count'),
        p.t('analytics.combined.tokens'),
        p.t('analytics.combined.error'),
      ];
      createBtnGroup(rightGroup, toolMetrics, toolMetricLabels, toolMetric, (v) => {
        toolMetric = v as ToolChartMetric;
        render(currentProps);
      });
    } else if (metric === 'models') {
      const modelMetrics: ChartMetric[] = ['count', 'tokens'];
      const modelMetricLabels = [
        p.t('analytics.combined.count'),
        p.t('analytics.combined.tokens'),
      ];
      createBtnGroup(rightGroup, modelMetrics, modelMetricLabels, modelMetric, (v) => {
        modelMetric = v as ChartMetric;
        render(currentProps);
      });
    } else if (metric === 'agents') {
      const agentMetrics: AgentMetric[] = ['tokens', 'cost', 'loc'];
      const agentMetricLabels = [
        p.t('analytics.combined.tokens'),
        p.t('chart.cost'),
        p.t('analytics.combined.loc'),
      ];
      createBtnGroup(rightGroup, agentMetrics, agentMetricLabels, agentMetric, (v) => {
        agentMetric = v as AgentMetric;
        render(currentProps);
      });
    } else if (metric === 'repos') {
      const repoMetrics: ChartMetric[] = ['count', 'tokens'];
      const repoMetricLabels = [
        p.t('analytics.combined.count'),
        p.t('analytics.combined.tokens'),
      ];
      createBtnGroup(rightGroup, repoMetrics, repoMetricLabels, repoMetric, (v) => {
        repoMetric = v as ChartMetric;
        render(currentProps);
      });
    } else if (metric === 'commits') {
      const commitMetrics: CommitMetric[] = ['count', 'cumulative', 'loc', 'leadTime'];
      const commitMetricLabels = [
        p.t('analytics.combined.commitCount'),
        p.t('analytics.combined.cumulative'),
        p.t('analytics.combined.loc'),
        p.t('analytics.combined.leadTime'),
      ];
      createBtnGroup(rightGroup, commitMetrics, commitMetricLabels, commitMetric, (v) => {
        commitMetric = v as CommitMetric;
        render(currentProps);
      });
    }

    toolbar.appendChild(rightGroup);
    return toolbar;
  }

  function renderChartArea(p: CombinedChartsSectionProps, parent: HTMLElement): void {
    destroyCharts();

    const chartEl = document.createElement('div');
    parent.appendChild(chartEl);

    if (metric === 'tokens') {
      const handle = mountDailyActivityChart(chartEl, {
        items: p.dailyActivity,
        period: p.period,
        mode: tokenMode,
        onDateClick: (date) => {
          selectedDate = selectedDate === date ? null : date;
          render(currentProps);
        },
        costOptimization: p.costOptimization,
        overlay: overlay
          ? { bucket: overlay.bucket, tokens: overlay.tokens, cost: overlay.cost }
          : null,
        chartColors: p.chartColors,
        cardSx: p.cardSx,
        isDark: p.isDark,
        t: p.t,
      });
      chartHandles.push(handle as AnyHandle);
    } else if (metric === 'releases') {
      const handle = mountReleasesLocChart(chartEl, {
        releases: p.releases ?? [],
        colors: p.colors,
        cardSx: p.cardSx,
        isDark: p.isDark,
        t: p.t,
      });
      chartHandles.push(handle as AnyHandle);
    } else if (p.fetchCombinedData) {
      if (combinedLoading && !combinedData) {
        const loadingEl = document.createElement('div');
        loadingEl.style.cssText =
          'display:flex;justify-content:center;align-items:center;min-height:240px;font-size:0.875rem;color:var(--am-color-text-secondary);';
        loadingEl.textContent = '...';
        parent.appendChild(loadingEl);
        return;
      }

      const handle = mountCombinedChartsContent(chartEl, {
        data: combinedData,
        periodDays: p.period,
        activeChart: metric,
        toolMetric,
        modelMetric,
        agentMetric,
        commitMetric,
        repoMetric,
        leadTimeOverlay: overlay
          ? {
              leadTimePerLoc: overlay.leadTimePerLoc,
              unmapped: overlay.leadTimeUnmapped,
              byPrefix: overlay.leadTimeByPrefix,
            }
          : null,
        onDateClick: (date) => {
          selectedDate = selectedDate === date ? null : date;
          render(currentProps);
        },
        theme: p.combinedTheme,
      });
      chartHandles.push(handle as AnyHandle);
    }
  }

  function render(p: CombinedChartsSectionProps): void {
    root.innerHTML = '';
    destroyCharts();

    const toolbar = renderToolbar(p);
    root.appendChild(toolbar);

    const chartArea = document.createElement('div');
    root.appendChild(chartArea);
    renderChartArea(p, chartArea);

    // Daily session list below chart when a date is selected
    if (selectedDate && p.period !== 90) {
      const sessionListEl = document.createElement('div');
      root.appendChild(sessionListEl);
      const sessionListHandle = mountDailySessionList(sessionListEl, {
        date: selectedDate,
        sessions: p.sessions,
        sessionsLoading: p.sessionsLoading,
        onSelectSession: p.onSelectSession,
        onJumpToTrace: p.onJumpToTrace,
        fetchSessionMessages: p.fetchSessionMessages,
        fetchSessionCommits: p.fetchSessionCommits,
        fetchSessionToolMetrics: p.fetchSessionToolMetrics,
        fetchDayToolMetrics: p.fetchDayToolMetrics,
        colors: p.colors,
        chartColors: p.chartColors,
        cardSx: p.cardSx,
        isDark: p.isDark,
        t: p.t,
      });
      chartHandles.push(sessionListHandle as AnyHandle);
    }
  }

  function fetchCombinedData(p: CombinedChartsSectionProps): void {
    if (!p.fetchCombinedData) return;
    combinedFetchCancelled = false;
    const rangeDays: CombinedRangeDays = p.period >= 90 ? 90 : 30;
    const periodMode: CombinedPeriodMode = p.period >= 90 ? 'week' : 'day';
    combinedLoading = true;
    void (async () => {
      const result = await p.fetchCombinedData!(periodMode, rangeDays);
      if (combinedFetchCancelled) return;
      combinedData = result;
      combinedLoading = false;
      render(currentProps);
    })();
  }

  function fetchOverlay(p: CombinedChartsSectionProps): void {
    if (!p.fetchQualityMetrics || metric === 'releases') return;
    overlayFetchCancelled = false;
    const now = new Date();
    const to = now.toISOString();
    const from = new Date(now.getTime() - p.period * 86_400_000).toISOString();
    void (async () => {
      const result = await p.fetchQualityMetrics!({ from, to });
      if (overlayFetchCancelled) return;
      if (result) {
        overlay = {
          bucket: result.bucket,
          tokens: result.metrics.tokensPerLoc.timeSeries,
          cost: result.costPerLocTimeSeries ?? [],
          leadTime: result.leadTimeMinTimeSeries ?? [],
          leadTimePerLoc: result.metrics.leadTimePerLoc.timeSeries,
          leadTimeUnmapped: result.leadTimeUnmappedTimeSeries ?? [],
          leadTimeByPrefix: result.leadTimeMinByPrefix ?? { prefixes: [], series: [] },
          deploymentFrequency: result.metrics.deploymentFrequency.timeSeries,
        };
        render(currentProps);
      }
    })();
  }

  fetchCombinedData(props);
  fetchOverlay(props);
  render(props);

  return {
    update(newProps: CombinedChartsSectionProps) {
      const periodChanged = newProps.period !== currentProps.period;
      if (periodChanged) selectedDate = null;
      combinedFetchCancelled = true;
      overlayFetchCancelled = true;
      currentProps = newProps;
      if (periodChanged) {
        combinedData = null;
        combinedLoading = false;
        overlay = null;
        fetchCombinedData(newProps);
        fetchOverlay(newProps);
      }
      render(newProps);
    },
    destroy() {
      combinedFetchCancelled = true;
      overlayFetchCancelled = true;
      destroyCharts();
      root.remove();
    },
  };
}
