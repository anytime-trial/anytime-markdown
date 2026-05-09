import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { lazyWithPreload } from './shared/lazyWithPreload';
import { usePerfReporter } from '../hooks/usePerfReporter';
import { TraceViewer } from '@anytime-markdown/trace-viewer';
import type { TraceFileSource } from '@anytime-markdown/trace-viewer';
import type { SourceLocation } from '@anytime-markdown/trace-core/types';
import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';

import type {
  TrailFilter,
  TrailMessage,
  TrailPromptEntry,
  TrailSession,
} from '../domain/parser/types';
import type { CostOptimizationData } from '../domain/parser/types';
import type { AnalyticsPanelProps } from './AnalyticsPanel';
import type { AnalyticsData } from '../domain/parser/types';
import { buildMessageTree } from '../domain/parser/buildMessageTree';
import { FilterBar } from './FilterBar';
import { PromptManager } from './PromptManager';
import { ReleasesPanel } from './ReleasesPanel';
import { SessionList } from './SessionList';
import { StatsBar } from './StatsBar';
import { TrailThemeProvider } from './TrailThemeContext';
import { getTokens } from '../theme/designTokens';
import { getC4Colors } from '../theme/c4Tokens';
import { TrailLocaleProvider, useTrailI18n } from '../i18n';
import type { TrailLocale } from '../i18n';
import type { TrailRelease } from '@anytime-markdown/trail-core/domain';
import { getTrailViewerTabDefs, normalizeTrailInitialTab } from './trailTabs';
import { MemoryPanel } from './MemoryPanel';
import { AnalyticsPanelSkeleton } from './shared/AnalyticsPanelSkeleton';
import { C4PanelSkeleton } from './shared/C4PanelSkeleton';
import { TabSkeleton } from './shared/TabSkeleton';

import type { C4ViewerCoreProps } from '../c4/components/C4ViewerCore';
import { ResizablePopup, type ResizablePopupSize } from '../c4/components/widgets/ResizablePopup';
import { useC4SequenceData } from '../c4/hooks/useC4SequenceData';

const AnalyticsPanel = lazyWithPreload(() =>
  import('./AnalyticsPanel').then((m) => ({ default: m.AnalyticsPanel })),
);
const C4ViewerCore = lazyWithPreload(() =>
  import('../c4/components/C4ViewerCore').then((m) => ({ default: m.C4ViewerCore })),
);
const MessageTimeline = lazyWithPreload(() =>
  import('./messages/MessageTimeline').then((m) => ({ default: m.MessageTimeline })),
);
const TraceTree = lazyWithPreload(() =>
  import('./messages/TraceTree').then((m) => ({ default: m.TraceTree })),
);

const tabPreloaders: Record<number, (() => Promise<unknown>) | undefined> = {
  0: () => AnalyticsPanel.preload(),
  1: () => Promise.all([MessageTimeline.preload(), TraceTree.preload()]),
  2: undefined,
  3: undefined,
  4: () => C4ViewerCore.preload(),
  5: undefined,
};

const preloadTab = (index: number) => {
  const fn = tabPreloaders[index];
  if (!fn) return;
  fn().catch((error) => {
    console.warn('TrailViewerCore: preloadTab failed', { index, error });
  });
};

/** C4-related props forwarded to the embedded C4ViewerCore. */
type C4Props = Omit<C4ViewerCoreProps, 'isDark' | 'containerHeight' | 'onShowSequence'>;

export interface TrailViewerCoreProps {
  readonly isDark?: boolean;
  readonly locale?: TrailLocale;
  readonly sessions: readonly TrailSession[];
  readonly allSessions?: readonly TrailSession[];
  readonly selectedSessionId?: string;
  readonly messages: readonly TrailMessage[];
  readonly filter: TrailFilter;
  readonly onSelectSession: (id: string) => void;
  readonly onFilterChange: (filter: TrailFilter) => void;
  readonly containerHeight?: string;
  readonly prompts?: readonly TrailPromptEntry[];
  readonly analytics?: AnalyticsData | null;
  readonly fetchSessionMessages?: AnalyticsPanelProps['fetchSessionMessages'];
  readonly fetchSessionCommits?: AnalyticsPanelProps['fetchSessionCommits'];
  readonly fetchSessionToolMetrics?: AnalyticsPanelProps['fetchSessionToolMetrics'];
  readonly fetchDayToolMetrics?: AnalyticsPanelProps['fetchDayToolMetrics'];
  readonly costOptimization?: CostOptimizationData | null;
  readonly releases?: readonly TrailRelease[];
  readonly fetchCombinedData?: AnalyticsPanelProps['fetchCombinedData'];
  readonly fetchQualityMetrics?: AnalyticsPanelProps['fetchQualityMetrics'];
  readonly fetchDeploymentFrequency?: AnalyticsPanelProps['fetchDeploymentFrequency'];
  readonly fetchReleaseQuality?: AnalyticsPanelProps['fetchReleaseQuality'];
  readonly sessionsLoading?: boolean;
  /** C4 viewer props. When provided, the C4 tab is shown. */
  readonly c4?: C4Props;
  /** Trace files. When provided, the Trace tab is shown. */
  readonly traceFiles?: readonly TraceFileSource[];
  /** Called when user clicks a node to jump to source. */
  readonly onJumpToSource?: (loc: SourceLocation) => void;
  /** 初期表示タブ番号（0=Analytics, 1=Messages, 2=Prompts, 4=C4, 5=Trace）*/
  readonly initialTab?: number;
  /**
   * WebSocket 経由でコマンドを送る関数。perf-report の送出に使う。
   * Web アプリ版では disableWebSocket=true により no-op になる。
   */
  readonly sendCommand?: (cmd: string, payload?: unknown) => void;
  /** WebSocket が接続済みか。usePerfReporter の queue flush 判定に使う。 */
  readonly wsConnected?: boolean;
  /** TrailDataServer のベース URL（Memory パネルの /api/memory/* に使用）。 */
  readonly serverUrl?: string;
}

const SESSION_LIST_WIDTH = 300;

export function TrailViewerCore(props: Readonly<TrailViewerCoreProps>) {
  return (
    <TrailLocaleProvider locale={props.locale}>
      <TrailThemeProvider isDark={props.isDark ?? true}>
        <TrailViewerCoreInner {...props} />
      </TrailThemeProvider>
    </TrailLocaleProvider>
  );
}

function TrailViewerCoreInner({
  isDark,
  sessions,
  allSessions,
  selectedSessionId,
  messages,
  filter,
  onSelectSession,
  onFilterChange,
  containerHeight = 'calc(100vh - 64px)',
  prompts = [],
  analytics = null,
  fetchSessionMessages,
  fetchSessionCommits,
  fetchSessionToolMetrics,
  fetchDayToolMetrics,
  costOptimization = null,
  releases = [],
  fetchCombinedData,
  fetchQualityMetrics,
  fetchDeploymentFrequency,
  fetchReleaseQuality,
  sessionsLoading,
  c4,
  traceFiles,
  onJumpToSource,
  initialTab,
  sendCommand,
  wsConnected = false,
  serverUrl = '',
}: Readonly<TrailViewerCoreProps>) {
  const { t } = useTrailI18n();
  const tokens = useMemo(() => getTokens(isDark ?? true), [isDark]);
  const { colors, scrollbarSx } = tokens;
  const c4Colors = useMemo(() => getC4Colors(isDark ?? true), [isDark]);
  const tabDefs = useMemo(
    () => getTrailViewerTabDefs({ hasC4: !!c4, hasTrace: !!traceFiles }),
    [c4, traceFiles],
  );
  const normalizedInitialTab = useMemo(
    () => normalizeTrailInitialTab(initialTab, { hasC4: !!c4, hasTrace: !!traceFiles }),
    [initialTab, c4, traceFiles],
  );
  const [activeTab, setActiveTab] = useState<number>(normalizedInitialTab);
  const [releasesPopupOpen, setReleasesPopupOpen] = useState(false);
  const [releasesPopupSize, setReleasesPopupSize] = useState<ResizablePopupSize | null>(null);
  const [releasesPopupMaximized, setReleasesPopupMaximized] = useState(false);
  const [promptsPopupOpen, setPromptsPopupOpen] = useState(false);
  const [promptsPopupSize, setPromptsPopupSize] = useState<ResizablePopupSize | null>(null);
  const [promptsPopupMaximized, setPromptsPopupMaximized] = useState(false);
  // 旧 Messages タブ (value=1) のレガシー URL / embed (?tab=1 / initialTab={1})
  // からの初回マウント時にメッセージポップアップを自動で開く。
  const [messagesPopupOpen, setMessagesPopupOpen] = useState(() => initialTab === 1);
  const [messagesPopupSize, setMessagesPopupSize] = useState<ResizablePopupSize | null>(null);
  const [messagesPopupMaximized, setMessagesPopupMaximized] = useState(false);
  const [visitedTabs, setVisitedTabs] = useState<ReadonlySet<number>>(
    () => new Set([normalizedInitialTab]),
  );
  const visitTab = useCallback((tab: number) => {
    setActiveTab(tab);
    setVisitedTabs((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }, []);
  const [activeSequenceElementId, setActiveSequenceElementId] = useState<string | null>(null);
  const c4SequenceState = useC4SequenceData(c4?.serverUrl, activeSequenceElementId);

  // perf-report: 初回マウント時の描画開始〜React mount 完了の所要時間を計測。
  // sendCommand が undefined の場合は no-op send を渡し、計測値はキューにも積まない。
  const noopSend = useCallback(() => {
    /* sendCommand 未提供 (Next.js 経由の Web アプリなど) では何もしない */
  }, []);
  const perfReporter = usePerfReporter(sendCommand ?? noopSend, wsConnected);
  useEffect(() => {
    if (!sendCommand) return; // 計測は拡張機能モードのみ有効
    // PerformanceNavigationTiming で domContentLoadedEventEnd を取得し、
    // mount 完了時点との差分を ms 単位で報告する。
    const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    const navStart = navEntries[0]?.domContentLoadedEventEnd;
    if (typeof navStart !== 'number' || navStart <= 0) return;
    const ms = Math.max(0, performance.now() - navStart);
    perfReporter.report('firstMount', ms);
    // 依存空配列で初回 mount のみ送信
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phase 5: idle prefetch
  // 初期描画完了後、ユーザーがクリックする前に残タブの chunk を順次 prefetch する。
  // モバイル（hover 不可）でも先読みされる。
  useEffect(() => {
    const candidates: Array<[number, () => Promise<unknown>]> = [
      [0, () => AnalyticsPanel.preload()],
      [1, () => Promise.all([MessageTimeline.preload(), TraceTree.preload()])],
      [4, () => C4ViewerCore.preload()],
    ];

    const remaining = candidates.filter(([idx]) => !visitedTabs.has(idx));
    if (remaining.length === 0) return;

    const ric =
      (globalThis as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
      ?? ((cb: () => void) => setTimeout(cb, 200));

    let cancelled = false;
    const run = (i: number) => {
      if (cancelled || i >= remaining.length) return;
      ric(() => {
        if (cancelled) return;
        const [, preload] = remaining[i];
        preload()
          .catch((error) => {
            console.warn('TrailViewerCore: idle prefetch failed', { index: remaining[i][0], error });
          })
          .finally(() => run(i + 1));
      });
    };
    run(0);

    return () => {
      cancelled = true;
    };
    // visitedTabs を依存に入れると訪問のたびに再起動するため、初回のみ実行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleShowSequence = useCallback(
    (elementId: string) => {
      setActiveSequenceElementId(elementId);
      visitTab(7);
    },
    [visitTab],
  );

  const visibleSessions = useMemo(() => {
    let result: readonly TrailSession[] = allSessions ?? sessions;
    const q = filter.searchText?.trim().toLowerCase();
    const skipCutoff = process.env.NEXT_PUBLIC_SHOW_UNLIMITED === '1' || !!q;
    if (!skipCutoff) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      result = result.filter((s) => new Date(s.startTime) >= cutoff);
    }
    if (filter.workspace) {
      result = result.filter((s) => s.workspace === filter.workspace);
    }
    if (q) {
      result = result.filter((s) => {
        const haystack = [s.slug, s.id, s.repoName, s.gitBranch, s.model]
          .filter((v): v is string => typeof v === 'string')
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      });
    }
    return result;
  }, [sessions, allSessions, filter.workspace, filter.searchText]);

  const handleJumpToTrace = useCallback(
    (session: TrailSession) => {
      const query = session.slug || session.id;
      onFilterChange({ ...filter, workspace: session.workspace ?? filter.workspace, searchText: query });
      onSelectSession(session.id);
      setMessagesPopupOpen(true);
    },
    [filter, onFilterChange, onSelectSession],
  );

  const selectedSession =
    (allSessions ?? sessions).find((s) => s.id === selectedSessionId)
    ?? visibleSessions.find((s) => s.id === selectedSessionId);
  const popupToolbarButtonSx = {
    textTransform: 'none',
    color: c4Colors.accent,
    borderColor: c4Colors.border,
    fontWeight: 600,
    fontSize: '0.875rem',
    borderRadius: '8px',
    transition: '250ms cubic-bezier(0.4, 0, 0.2, 1)',
    '&:hover': { bgcolor: c4Colors.hover },
    '&:focus-visible': { outline: `2px solid ${c4Colors.accent}`, outlineOffset: '2px' },
    '&:disabled': { color: c4Colors.textMuted },
  } as const;

  // メッセージタブとメッセージポップアップの両方で同じ JSX を使うため変数化。
  // 親 state を共有するので filter / 選択セッション / メッセージは両者で同期する。
  const messagesTabContent = (
    <>
      <FilterBar
        filter={filter}
        sessions={allSessions ?? sessions}
        onChange={onFilterChange}
      />

      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Box
          sx={{
            width: SESSION_LIST_WIDTH,
            minWidth: SESSION_LIST_WIDTH,
            borderRight: 1,
            borderColor: colors.border,
            overflowY: 'auto',
            ...scrollbarSx,
          }}
        >
          <SessionList
            sessions={visibleSessions}
            selectedId={selectedSessionId}
            onSelect={onSelectSession}
          />
        </Box>

        <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Suspense fallback={<TabSkeleton height="100%" />}>
            <MessageTimeline
              nodes={buildMessageTree(messages)}
              session={selectedSession}
              onSelectMessage={() => { /* scroll handled inside component */ }}
            />
            {selectedSessionId && messages.length > 0 ? (
              <Box sx={{ flex: 1, overflow: 'auto', ...scrollbarSx }}>
                <TraceTree nodes={buildMessageTree(messages)} />
              </Box>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                <Typography variant="body2" sx={{ color: colors.textSecondary }}>
                  {selectedSessionId ? t('viewer.loading') : t('viewer.selectSession')}
                </Typography>
              </Box>
            )}
          </Suspense>
        </Box>
      </Box>

      <StatsBar session={selectedSession} messages={messages} />
    </>
  );

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: containerHeight,
        overflow: 'hidden',
        bgcolor: colors.midnightNavy,
        color: colors.textPrimary,
        position: 'relative',
      }}
    >
      {/* aria-live region for screen reader announcements */}
      <Box
        aria-live="polite"
        aria-atomic="true"
        sx={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {selectedSessionId && messages.length > 0
          ? `${messages.length} ${t('stats.messages')} ${t('viewer.loaded')}`
          : ''}
      </Box>

      {/* Top: Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: colors.border, display: 'flex', alignItems: 'center' }}>
        <Tabs
          value={activeTab}
          onChange={(_e, v: number) => visitTab(v)}
          aria-label="Trail viewer tabs"
          sx={{
            flex: 1,
            '& .MuiTab-root': { color: colors.textSecondary },
            '& .Mui-selected': { color: colors.iceBlue },
            '& .MuiTabs-indicator': { backgroundColor: colors.iceBlue },
          }}
        >
          {tabDefs.map((tab) => (
            <Tab
              key={tab.value}
              value={tab.value}
              id={tab.id}
              aria-controls={tab.panelId}
              label={t(tab.i18nKey)}
              onMouseEnter={tab.preloadIndex === undefined ? undefined : () => preloadTab(tab.preloadIndex!)}
              onFocus={tab.preloadIndex === undefined ? undefined : () => preloadTab(tab.preloadIndex!)}
            />
          ))}
        </Tabs>

      </Box>

      {visitedTabs.has(0) && (
        <Box
          role="tabpanel"
          id="trail-panel-0"
          aria-labelledby="trail-tab-0"
          sx={{ display: activeTab !== 0 ? 'none' : 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
        >
          <Suspense fallback={<AnalyticsPanelSkeleton />}>
            <AnalyticsPanel
              analytics={analytics}
              sessions={allSessions ?? sessions}
              sessionsLoading={sessionsLoading}
              onSelectSession={onSelectSession}
              onJumpToTrace={handleJumpToTrace}
              fetchSessionMessages={fetchSessionMessages}
              fetchSessionCommits={fetchSessionCommits}
              fetchSessionToolMetrics={fetchSessionToolMetrics}
              fetchDayToolMetrics={fetchDayToolMetrics}
              costOptimization={costOptimization}
              fetchCombinedData={fetchCombinedData}
              fetchQualityMetrics={fetchQualityMetrics}
              fetchDeploymentFrequency={fetchDeploymentFrequency}
              fetchReleaseQuality={fetchReleaseQuality}
              onOpenReleasesPopup={() => setReleasesPopupOpen(true)}
              onOpenPromptsPopup={() => setPromptsPopupOpen(true)}
              onOpenMessagesPopup={() => setMessagesPopupOpen(true)}
            />
          </Suspense>
        </Box>
      )}

      {c4 && visitedTabs.has(4) && (
        <Box
          role="tabpanel"
          id="trail-panel-4"
          aria-labelledby="trail-tab-4"
          sx={{ display: activeTab !== 4 ? 'none' : 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
        >
          <Suspense fallback={<C4PanelSkeleton />}>
            <C4ViewerCore
              isDark={isDark}
              containerHeight="100%"
              onShowSequence={handleShowSequence}
              {...c4}
            />
          </Suspense>
        </Box>
      )}

      {(traceFiles || c4) && (
        <Box
          role="tabpanel"
          id="trail-panel-5"
          aria-labelledby="trail-tab-5"
          sx={{ display: activeTab !== 5 ? 'none' : 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
        >
          <TraceViewer
            traceFiles={traceFiles ?? []}
            isDark={isDark ?? true}
            onJumpToSource={onJumpToSource}
            c4Sequence={c4SequenceState.model}
          />
        </Box>
      )}

      {visitedTabs.has(6) && (
        <Box
          role="tabpanel"
          id="trail-panel-6"
          aria-labelledby="trail-tab-6"
          sx={{ display: activeTab !== 6 ? 'none' : 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
        >
          <MemoryPanel serverUrl={serverUrl} />
        </Box>
      )}

      {releasesPopupOpen && (
        <ResizablePopup
          title={t('viewer.tab.releases')}
          ariaLabel={t('viewer.tab.releases')}
          onClose={() => setReleasesPopupOpen(false)}
          isDark={isDark ?? true}
          colors={c4Colors}
          size={releasesPopupSize}
          onSizeChange={setReleasesPopupSize}
          maximized={releasesPopupMaximized}
          onMaximizedChange={setReleasesPopupMaximized}
          defaultMaxWidth={1120}
          centered
          withBackdrop
          toolbarButtonSx={popupToolbarButtonSx}
          i18nMaximize={t('c4.popup.maximize')}
          i18nRestore={t('c4.popup.restore')}
          i18nClose={t('c4.popup.close')}
          i18nResize={t('c4.popup.resize')}
        >
          <ReleasesPanel releases={releases ?? []} />
        </ResizablePopup>
      )}
      {promptsPopupOpen && (
        <ResizablePopup
          title={t('viewer.tab.prompts')}
          ariaLabel={t('viewer.tab.prompts')}
          onClose={() => setPromptsPopupOpen(false)}
          isDark={isDark ?? true}
          colors={c4Colors}
          size={promptsPopupSize}
          onSizeChange={setPromptsPopupSize}
          maximized={promptsPopupMaximized}
          onMaximizedChange={setPromptsPopupMaximized}
          defaultMaxWidth={1120}
          centered
          withBackdrop
          toolbarButtonSx={popupToolbarButtonSx}
          i18nMaximize={t('c4.popup.maximize')}
          i18nRestore={t('c4.popup.restore')}
          i18nClose={t('c4.popup.close')}
          i18nResize={t('c4.popup.resize')}
        >
          <PromptManager prompts={prompts} />
        </ResizablePopup>
      )}
      {messagesPopupOpen && (
        <ResizablePopup
          title={t('viewer.tab.messages')}
          ariaLabel={t('viewer.tab.messages')}
          onClose={() => setMessagesPopupOpen(false)}
          isDark={isDark ?? true}
          colors={c4Colors}
          size={messagesPopupSize}
          onSizeChange={setMessagesPopupSize}
          maximized={messagesPopupMaximized}
          onMaximizedChange={setMessagesPopupMaximized}
          defaultMaxWidth={1280}
          centered
          withBackdrop
          toolbarButtonSx={popupToolbarButtonSx}
          i18nMaximize={t('c4.popup.maximize')}
          i18nRestore={t('c4.popup.restore')}
          i18nClose={t('c4.popup.close')}
          i18nResize={t('c4.popup.resize')}
        >
          {messagesTabContent}
        </ResizablePopup>
      )}
    </Box>
  );
}
