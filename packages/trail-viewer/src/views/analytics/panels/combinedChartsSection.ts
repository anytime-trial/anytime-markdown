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
  CombinedChartKind,
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
import { createTooltip } from '@anytime-markdown/ui-core';

// メトリクストグルの説明ツールチップ i18n キー（value → key。旧 CombinedChartsSection の
// 各 ToggleButton を包んでいた Tooltip title を復元する。value 名とキー名は一部非対称）。
const METRIC_DESCRIPTION_KEYS: Record<CombinedMetric, string> = {
  tokens: 'chart.tokenUsage.description',
  agents: 'analytics.combined.agent.description',
  models: 'analytics.combined.model.description',
  skills: 'analytics.combined.skill.description',
  tools: 'analytics.combined.tool.description',
  repos: 'analytics.combined.repository.description',
  commits: 'analytics.combined.commitPrefix.description',
  releases: 'analytics.combined.release.description',
};

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

/** MUI OpenInNew アイコンの SVG path（↗ ポップアップトリガ用）。 */
const OPEN_IN_NEW_PATH =
  'M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z';

interface PopupTriggerSpec {
  /** data-popup-trigger 値 / テスト・識別子。 */
  readonly trigger: 'messages' | 'prompts' | 'releases';
  /** ツールチップ・aria-label の i18n キー。 */
  readonly i18nKey: string;
  /** props 上のコールバックフィールド名。 */
  readonly callbackKey:
    | 'onOpenMessagesPopup'
    | 'onOpenPromptsPopup'
    | 'onOpenReleasesPopup';
}

/**
 * metric トグルに埋め込む ↗ ポップアップトリガ定義。
 * vanilla 化（bcd12d461）で欠落したため復元したもの。
 */
const METRIC_POPUP_TRIGGERS: Partial<Record<CombinedMetric, PopupTriggerSpec>> = {
  agents: { trigger: 'messages', i18nKey: 'message.openPopup', callbackKey: 'onOpenMessagesPopup' },
  skills: { trigger: 'prompts', i18nKey: 'prompt.openPopup', callbackKey: 'onOpenPromptsPopup' },
  releases: { trigger: 'releases', i18nKey: 'releases.openPopup', callbackKey: 'onOpenReleasesPopup' },
};

function createOpenInNewIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'width:14px;height:14px;fill:currentColor;display:block;';
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', OPEN_IN_NEW_PATH);
  svg.appendChild(path);
  return svg;
}

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
  // ツールバートグルの tooltip handle（toolbar 再構築・destroy で残置を防ぐため追跡）。
  const toolbarTooltips: Array<{ destroy: () => void }> = [];

  // 永続ホスト: ツールバー / チャート / セッションリストを分離して保持する。
  // drill-down（日付クリック）時はセッションリストのみ差し替え、チャートは破棄せず
  // chart-core 内部の選択ハイライト（selectedIndex）を温存する。
  const toolbarHost = document.createElement('div');
  const chartArea = document.createElement('div');
  const sessionListHost = document.createElement('div');
  root.append(toolbarHost, chartArea, sessionListHost);
  let sessionListHandle: AnyHandle | null = null;
  // 現在のチャートを in-place 更新する関数（metric ごとに renderChartArea が設定）。
  let activeChartUpdate: ((p: CombinedChartsSectionProps) => void) | null = null;

  function destroyCharts(): void {
    for (const h of chartHandles) {
      h.destroy();
    }
    chartHandles.length = 0;
  }

  function destroySessionList(): void {
    sessionListHandle?.destroy();
    sessionListHandle = null;
    sessionListHost.replaceChildren();
  }

  function createToggleBtn(label: string, value: string, currentVal: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.dataset['value'] = value;
    const active = value === currentVal;
    // スクリーンリーダー向けに選択状態を伝える（旧 MUI ToggleButton が自動付与していた）。
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    const baseBg = active ? currentProps.colors.iceBlueBg : 'transparent';
    btn.style.cssText = [
      'padding:4px 10px',
      'font-size:0.8rem',
      'border:1px solid',
      'cursor:pointer',
      `background-color:${baseBg}`,
      active
        ? `border-color:${currentProps.colors.iceBlue};color:${currentProps.colors.iceBlue};`
        : `border-color:${currentProps.colors.border};color:${currentProps.colors.textSecondary};`,
    ].join(';');
    // hover フィードバック（旧 toggleSx の '&:hover'）。非アクティブ時のみ背景を hover 色に。
    if (!active) {
      btn.addEventListener('mouseenter', () => { btn.style.backgroundColor = currentProps.colors.iceBlueBg; });
      btn.addEventListener('mouseleave', () => { btn.style.backgroundColor = 'transparent'; });
    }
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

  /**
   * metric トグル内に ↗ ポップアップトリガ（ResizablePopup を開く）を埋め込む。
   * 親トグルの metric 切替を発火させないよう click/keydown を stopPropagation する。
   */
  function appendPopupTrigger(
    btn: HTMLButtonElement,
    p: CombinedChartsSectionProps,
    spec: PopupTriggerSpec,
  ): void {
    const cb = p[spec.callbackKey];
    const label = p.t(spec.i18nKey);
    const icon = document.createElement('span');
    icon.dataset['popupTrigger'] = spec.trigger;
    icon.setAttribute('role', 'button');
    icon.setAttribute('aria-label', label);
    icon.title = label;
    icon.tabIndex = cb ? 0 : -1;
    icon.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      'width:18px',
      'height:18px',
      'margin-left:6px',
      'border-radius:4px',
      `color:${p.colors.textSecondary}`,
      cb ? 'opacity:1' : 'opacity:0.35',
      cb ? 'cursor:pointer' : 'cursor:default',
    ].join(';');
    icon.appendChild(createOpenInNewIcon());

    const activate = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
      cb?.();
    };
    icon.addEventListener('click', activate);
    icon.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      activate(event);
    });
    btn.appendChild(icon);
  }

  /** metric セレクタ群を構築する。agents/skills/releases には ↗ トリガを埋め込む。 */
  function createMetricGroup(
    parent: HTMLElement,
    p: CombinedChartsSectionProps,
    labels: readonly string[],
  ): void {
    const group = document.createElement('div');
    group.style.cssText = 'display:inline-flex;border-radius:4px;overflow:hidden;';
    for (let i = 0; i < METRICS.length; i++) {
      const value = METRICS[i] ?? '';
      const btn = createToggleBtn(labels[i] ?? value, value, metric);
      // 各メトリクスの説明ツールチップ（旧 ToggleButton を包む Tooltip title）を復元。
      const descKey = METRIC_DESCRIPTION_KEYS[value as CombinedMetric];
      if (descKey) {
        toolbarTooltips.push(createTooltip({ reference: btn, title: p.t(descKey), multiline: true }));
      }
      const spec = METRIC_POPUP_TRIGGERS[value as CombinedMetric];
      if (spec) {
        // ↗ をボタン内に並べるため inline レイアウトへ調整する。
        btn.style.display = 'inline-flex';
        btn.style.alignItems = 'center';
        appendPopupTrigger(btn, p, spec);
      }
      btn.addEventListener('click', () => {
        metric = value as CombinedMetric;
        if (value === 'releases') selectedDate = null;
        render(currentProps);
      });
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
    createMetricGroup(leftGroup, p, metricLabels);

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

  // drill-down クリック: セッションリストのみ差し替え、チャートは温存する。
  const handleDateClick = (date: string): void => {
    selectedDate = selectedDate === date ? null : date;
    renderSessionList(currentProps);
  };

  // 各 metric のチャート props を構築（mount / update で共有しデータ更新時の再生成を避ける）。
  function buildDailyProps(p: CombinedChartsSectionProps) {
    return {
      items: p.dailyActivity,
      period: p.period,
      mode: tokenMode,
      onDateClick: handleDateClick,
      costOptimization: p.costOptimization,
      overlay: overlay ? { bucket: overlay.bucket, tokens: overlay.tokens, cost: overlay.cost } : null,
      chartColors: p.chartColors,
      cardSx: p.cardSx,
      isDark: p.isDark,
      t: p.t,
    };
  }
  function buildReleasesProps(p: CombinedChartsSectionProps) {
    return { releases: p.releases ?? [], colors: p.colors, cardSx: p.cardSx, isDark: p.isDark, t: p.t };
  }
  function buildCombinedProps(p: CombinedChartsSectionProps) {
    return {
      data: combinedData,
      periodDays: p.period,
      // この関数は combined 分岐でのみ呼ばれ metric は tokens/releases 以外（= CombinedChartKind）。
      activeChart: metric as CombinedChartKind,
      toolMetric,
      modelMetric,
      agentMetric,
      commitMetric,
      repoMetric,
      leadTimeOverlay: overlay
        ? { leadTimePerLoc: overlay.leadTimePerLoc, unmapped: overlay.leadTimeUnmapped, byPrefix: overlay.leadTimeByPrefix }
        : null,
      onDateClick: handleDateClick,
      theme: p.combinedTheme,
    };
  }

  function renderChartArea(p: CombinedChartsSectionProps, parent: HTMLElement): void {
    destroyCharts();
    activeChartUpdate = null;

    const chartEl = document.createElement('div');
    parent.appendChild(chartEl);

    if (metric === 'tokens') {
      const handle = mountDailyActivityChart(chartEl, buildDailyProps(p));
      chartHandles.push(handle as AnyHandle);
      activeChartUpdate = (np) => handle.update(buildDailyProps(np));
    } else if (metric === 'releases') {
      const handle = mountReleasesLocChart(chartEl, buildReleasesProps(p));
      chartHandles.push(handle as AnyHandle);
      activeChartUpdate = (np) => handle.update(buildReleasesProps(np));
    } else if (p.fetchCombinedData) {
      if (combinedLoading && !combinedData) {
        const loadingEl = document.createElement('div');
        loadingEl.style.cssText =
          'display:flex;justify-content:center;align-items:center;min-height:240px;font-size:0.875rem;color:var(--am-color-text-secondary);';
        loadingEl.textContent = '...';
        parent.appendChild(loadingEl);
        return;
      }
      const handle = mountCombinedChartsContent(chartEl, buildCombinedProps(p));
      chartHandles.push(handle as AnyHandle);
      activeChartUpdate = (np) => handle.update(buildCombinedProps(np));
    }
  }

  // データのみ更新（metric/period 不変）: チャートを破棄せず in-place update。
  // chart-core 内部の選択ハイライト（selectedIndex）が温存される。
  function refreshData(p: CombinedChartsSectionProps): void {
    if (activeChartUpdate) {
      activeChartUpdate(p);
      renderSessionList(p);
    } else {
      // チャート未生成（loading 等）の場合は通常 render で構築する。
      render(p);
    }
  }

  // selectedDate に応じてセッションリストのみを差し替える（チャートは温存）。
  function renderSessionList(p: CombinedChartsSectionProps): void {
    destroySessionList();
    if (selectedDate && p.period !== 90) {
      sessionListHandle = mountDailySessionList(sessionListHost, {
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
      }) as AnyHandle;
    }
  }

  function render(p: CombinedChartsSectionProps): void {
    destroyCharts();
    for (const tt of toolbarTooltips) tt.destroy();
    toolbarTooltips.length = 0;
    toolbarHost.replaceChildren(renderToolbar(p));
    chartArea.replaceChildren();
    renderChartArea(p, chartArea);
    renderSessionList(p);
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
      currentProps = newProps;
      // period が変わったときだけ進行中の fetch をキャンセルして再取得する。
      // 非 period の update（頻繁な store 通知）で初回 fetch を取り消すと combinedData が
      // null のまま再取得されず、token 以外のチャートが永久に表示されない不具合になる。
      if (periodChanged) {
        combinedFetchCancelled = true;
        overlayFetchCancelled = true;
        combinedData = null;
        combinedLoading = false;
        overlay = null;
        fetchCombinedData(newProps);
        fetchOverlay(newProps);
        render(newProps);
      } else {
        // データのみ更新: チャートを破棄せず in-place 更新し、選択ハイライトを温存する。
        refreshData(newProps);
      }
    },
    destroy() {
      combinedFetchCancelled = true;
      overlayFetchCancelled = true;
      destroyCharts();
      destroySessionList();
      for (const tt of toolbarTooltips) tt.destroy();
      toolbarTooltips.length = 0;
      root.remove();
    },
  };
}
