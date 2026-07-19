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
  BucketUnit,
  ChartMetric,
  CombinedChartKind,
  CombinedMetric,
  CommitMetric,
  DailyViewMode,
  PeriodDays,
  ToolChartMetric,
} from '../../../components/analytics/types';
import {
  PERIOD_DAYS_MAX,
  PERIOD_DAYS_MIN,
  clampPeriodDays,
  resolveCombinedRangeDays,
} from '../../../domain/analytics/periodSelection';
import type { ThemeColors, ThemeChartColors } from '../../../theme/designTokens';
import { mountDailyActivityChart } from '../charts/dailyActivityChart';
import { mountReleasesLocChart } from '../charts/releasesLocChart';
import {
  mountCombinedChartsContent,
  type CombinedChartsContentThemeProps,
} from '../charts/combined/combinedChartsContent';
import { mountDailySessionList } from './dailySessionList';
import { createTooltip, createSpinner, createSelect } from '@anytime-markdown/ui-core';
import { normalizeWorkspaceName } from '@anytime-markdown/trail-core/domain';

// メトリクストグルの説明ツールチップ i18n キー（value → key。旧 CombinedChartsSection の
// 各 ToggleButton を包んでいた Tooltip title を復元する。value 名とキー名は一部非対称）。
const METRIC_DESCRIPTION_KEYS: Record<CombinedMetric, string> = {
  tokens: 'chart.tokenUsage.description',
  agents: 'analytics.combined.agent.description',
  models: 'analytics.combined.model.description',
  skills: 'analytics.combined.skill.description',
  tools: 'analytics.combined.tool.description',
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
    workspace?: string,
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
  'commits',
  'releases',
];

const BUCKET_UNITS: BucketUnit[] = ['day', 'week'];

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
  // ワークスペース切替（'' = All・フィルタなし）。選択肢はサーバー応答（workspaces）由来。
  let workspace = '';
  let workspaceOptions: readonly string[] = [];
  // 棒グラフの集計単位。旧実装は period === 90 から暗黙に決めていたが、
  // 期間が任意日数になったため独立したトグルを唯一の決定要因にする。
  let bucket: BucketUnit = 'day';
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
  // 進行中の fetch は「最新のリクエストか」で判定する。共有 boolean をキャンセルフラグに
  // 使うと、後発の fetch がフラグを false へ戻した隙に先発の遅い応答が採用され、
  // 表示中の期間・集計単位と食い違うデータで上書きされる（period / bucket の連続変更）。
  let combinedRequestId = 0;
  let overlayRequestId = 0;

  let currentProps = props;

  const chartHandles: AnyHandle[] = [];
  // ツールバートグルの tooltip handle（toolbar 再構築・destroy で残置を防ぐため追跡）。
  const toolbarTooltips: Array<{ destroy: () => void }> = [];
  // ワークスペース select の handle（toolbar 再構築・destroy で残置を防ぐため追跡）。
  const toolbarSelects: Array<{ destroy: () => void }> = [];

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

  /**
   * 期間（日数）の数値入力欄。
   *
   * 確定は change（Enter / フォーカスアウト）のみ購読する。input を購読すると打鍵ごとに
   * setPeriod → 親の再描画が走り、ツールバーごと作り直されて 1 文字しか入力できなくなる。
   */
  function createPeriodInput(p: CombinedChartsSectionProps): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:4px;';

    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(PERIOD_DAYS_MIN);
    input.max = String(PERIOD_DAYS_MAX);
    input.step = '1';
    input.value = String(p.period);
    input.dataset['role'] = 'period-days';
    input.setAttribute('aria-label', p.t('analytics.combined.periodDays'));
    input.style.cssText = [
      'width:56px',
      'padding:4px 6px',
      'font-size:0.8rem',
      'border:1px solid',
      `border-color:${p.colors.border}`,
      `background-color:${p.colors.iceBlueBg}`,
      `color:${p.colors.textSecondary}`,
      'border-radius:4px',
    ].join(';');

    input.addEventListener('change', () => {
      const next = clampPeriodDays(input.valueAsNumber);
      // クランプ結果を欄へ書き戻す（範囲外を入力したまま残さない）。
      input.value = String(next);
      if (next === currentProps.period) return;
      selectedDate = null;
      p.setPeriod(next);
    });

    const unit = document.createElement('span');
    unit.textContent = p.t('releases.days');
    unit.style.cssText = `font-size:0.8rem;color:${p.colors.textSecondary};`;

    toolbarTooltips.push(
      createTooltip({ reference: input, title: p.t('analytics.combined.periodDays.description'), multiline: true }),
    );

    wrap.append(input, unit);
    return wrap;
  }

  /** 集計単位（1day / 1week）トグル。パネル内の全 metric に適用する。 */
  function createBucketToggle(p: CombinedChartsSectionProps): HTMLElement {
    const group = document.createElement('div');
    group.style.cssText = 'display:inline-flex;border-radius:4px;overflow:hidden;';
    const labels: Record<BucketUnit, string> = {
      day: p.t('analytics.combined.bucketDay'),
      week: p.t('analytics.combined.bucketWeek'),
    };
    for (const unit of BUCKET_UNITS) {
      const btn = createToggleBtn(labels[unit], unit, bucket);
      btn.dataset['role'] = 'bucket-unit';
      btn.addEventListener('click', () => {
        if (bucket === unit) return;
        bucket = unit;
        // 週バケットでは単日ドリルダウンできないため選択を解除する。
        selectedDate = null;
        // 表示だけでなく集計モードが変わるため combined データを取り直す
        // （fetchCombinedData が新しい requestId を発行し、先発の応答は破棄される）。
        combinedData = null;
        combinedLoading = false;
        fetchCombinedData(currentProps);
        render(currentProps);
      });
      group.appendChild(btn);
    }
    toolbarTooltips.push(
      createTooltip({ reference: group, title: p.t('analytics.combined.bucketUnit.description'), multiline: true }),
    );
    return group;
  }

  /**
   * ワークスペース切替ドロップダウン（All + repo_name の worktree 正規化名）。
   * combined セクション全体（tokens 含む全 metric・ドリルダウン）に適用する。
   */
  function createWorkspaceSelect(p: CombinedChartsSectionProps): HTMLElement {
    const handle = createSelect({
      value: workspace,
      options: [
        { value: '', label: p.t('analytics.combined.workspaceAll') },
        ...workspaceOptions.map((w) => ({ value: w, label: w })),
      ],
      ariaLabel: p.t('analytics.combined.workspace'),
      fullWidth: false,
      minWidth: 160, // 選択値の文字数で幅がガタつくのを防ぐ（filterBar と同趣旨）。
      onChange: (val) => {
        if (val === workspace) return;
        workspace = val;
        // フィルタが変わると単日の内訳も変わるためドリルダウン選択を解除する。
        selectedDate = null;
        // 集計対象が変わるため combined データを取り直す
        // （fetchCombinedData が新しい requestId を発行し、先発の応答は破棄される）。
        combinedData = null;
        combinedLoading = false;
        fetchCombinedData(currentProps);
        // All へ戻ったときに overlay 未取得なら取り直す（選択中はガードで no-op）。
        if (workspace === '' && !overlay) fetchOverlay(currentProps);
        render(currentProps);
      },
    });
    toolbarSelects.push(handle);
    toolbarTooltips.push(
      createTooltip({
        reference: handle.el,
        title: p.t('analytics.combined.workspace.description'),
        multiline: true,
      }),
    );
    return handle.el;
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
      p.t('analytics.combined.commitPrefix'),
      p.t('analytics.combined.release'),
    ];
    createMetricGroup(leftGroup, p, metricLabels);

    // Period input + bucket unit toggle + workspace select (not for releases)
    if (metric !== 'releases') {
      leftGroup.appendChild(createPeriodInput(p));
      leftGroup.appendChild(createBucketToggle(p));
      leftGroup.appendChild(createWorkspaceSelect(p));
    }

    toolbar.appendChild(leftGroup);

    // Right: sub-metric toggles
    const rightGroup = document.createElement('div');
    rightGroup.style.cssText = 'display:inline-flex;align-items:center;gap:8px;';

    if (metric === 'tokens') {
      const tokenModes: DailyViewMode[] = ['tokens', 'cost', 'loc'];
      const tokenModeLabels = [p.t('chart.tokens'), p.t('chart.cost'), p.t('chart.loc')];
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
    // workspace 選択中は combined 応答に同梱された絞り込み済み dailyActivity を使う。
    // 全体集計由来の overlay / costOptimization は、絞り込んだ棒グラフと混在させると
    // 誤読を招くため選択中は表示しない（spec §5.2.1）。
    const filtered = workspace !== '';
    return {
      items: filtered ? (combinedData?.dailyActivity ?? []) : p.dailyActivity,
      period: p.period,
      bucket,
      mode: tokenMode,
      onDateClick: handleDateClick,
      costOptimization: filtered ? null : p.costOptimization,
      overlay: !filtered && overlay
        ? { bucket: overlay.bucket, tokens: overlay.tokens, cost: overlay.cost }
        : null,
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
      // 全体集計由来の overlay は workspace 選択中は重ねない（buildDailyProps と同趣旨）。
      leadTimeOverlay: workspace === '' && overlay
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
      // workspace 選択中の tokens チャートは combined 応答（dailyActivity 同梱）待ち。
      if (workspace !== '' && combinedLoading && !combinedData) {
        const loadingEl = document.createElement('div');
        loadingEl.style.cssText =
          'display:flex;justify-content:center;align-items:center;min-height:240px;';
        loadingEl.appendChild(createSpinner({ size: 24, ariaLabel: p.t('viewer.loading') }).el);
        parent.appendChild(loadingEl);
        return;
      }
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
          'display:flex;justify-content:center;align-items:center;min-height:240px;';
        loadingEl.appendChild(createSpinner({ size: 24, ariaLabel: p.t('viewer.loading') }).el);
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
    // 週バケットでは棒 1 本が単日に対応しないため、日付ドリルダウンを出さない。
    if (selectedDate && bucket !== 'week') {
      // workspace 選択中は該当ワークスペースのセッションのみ（repoName の正規化名で一致）。
      const visibleSessions = workspace === ''
        ? p.sessions
        : p.sessions.filter((s) => normalizeWorkspaceName(s.repoName ?? '') === workspace);
      sessionListHandle = mountDailySessionList(sessionListHost, {
        date: selectedDate,
        sessions: visibleSessions,
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

  function findPeriodInput(): HTMLInputElement | null {
    return toolbarHost.querySelector<HTMLInputElement>('input[data-role="period-days"]');
  }

  /**
   * 期間入力欄の編集中状態を再描画から守る。
   *
   * render() はツールバーごと作り直すが、非同期 fetch の解決（fetchCombinedData /
   * fetchOverlay）からも呼ばれるため、入力中に背景の再描画が走ると未確定の入力値と
   * フォーカスが失われる。フォーカス中のときだけ生の入力値を引き継ぐ
   * （非フォーカス時は props.period を正として新しい値を表示する）。
   *
   * 選択範囲は復元しない。type=number の input で selectionStart を触ると
   * InvalidStateError を投げるブラウザがあるため。
   */
  function render(p: CombinedChartsSectionProps): void {
    const editing = findPeriodInput();
    const editingValue =
      editing && document.activeElement === editing ? editing.value : null;

    destroyCharts();
    for (const tt of toolbarTooltips) tt.destroy();
    toolbarTooltips.length = 0;
    for (const s of toolbarSelects) s.destroy();
    toolbarSelects.length = 0;
    toolbarHost.replaceChildren(renderToolbar(p));
    if (editingValue !== null) {
      const input = findPeriodInput();
      if (input) {
        input.value = editingValue;
        input.focus();
      }
    }
    chartArea.replaceChildren();
    renderChartArea(p, chartArea);
    renderSessionList(p);
  }

  function fetchCombinedData(p: CombinedChartsSectionProps): void {
    if (!p.fetchCombinedData) return;
    const requestId = ++combinedRequestId;
    const rangeDays: CombinedRangeDays = resolveCombinedRangeDays(p.period);
    const periodMode: CombinedPeriodMode = bucket;
    combinedLoading = true;
    void (async () => {
      const result = await p.fetchCombinedData!(periodMode, rangeDays, workspace || undefined);
      if (requestId !== combinedRequestId) return;
      combinedData = result;
      // ドロップダウンの選択肢はフィルタ有無に依らず全件が返る（一覧を安定させる）。
      workspaceOptions = result.workspaces ?? [];
      combinedLoading = false;
      render(currentProps);
    })();
  }

  function fetchOverlay(p: CombinedChartsSectionProps): void {
    // workspace 選択中は overlay を表示しないため取得もしない（buildDailyProps 参照）。
    if (!p.fetchQualityMetrics || metric === 'releases' || workspace !== '') return;
    const requestId = ++overlayRequestId;
    const now = new Date();
    const to = now.toISOString();
    const from = new Date(now.getTime() - p.period * 86_400_000).toISOString();
    void (async () => {
      const result = await p.fetchQualityMetrics!({ from, to });
      if (requestId !== overlayRequestId) return;
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
      // 進行中の応答を破棄する（以降どの requestId とも一致しなくなる）。
      combinedRequestId++;
      overlayRequestId++;
      destroyCharts();
      destroySessionList();
      for (const tt of toolbarTooltips) tt.destroy();
      toolbarTooltips.length = 0;
      for (const s of toolbarSelects) s.destroy();
      toolbarSelects.length = 0;
      root.remove();
    },
  };
}
