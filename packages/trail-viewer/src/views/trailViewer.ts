/**
 * TrailViewer vanilla DOM mount.
 *
 * Reproduces TrailViewerCoreInner as a framework-free factory.
 * `mountTrailViewer(container, props)` → VanillaViewHandle<TrailViewerViewProps>
 *
 * Architecture:
 *  - Owns tab bar (createTabs from ui-core), visitedTabs Set, and popup state.
 *  - Lazily mounts sub-views on first tab visit.
 *  - Messages popup owns FilterBar / SessionList / MessageTimeline / TraceTree / StatsBar.
 *  - TraceViewer and PromptManager (React components) are mounted via
 *    `mountReactIsland` (vanilla→React bridge in reactIsland.tsx).
 */

import { createTabs } from '@anytime-markdown/ui-core';
import { mountReactIsland } from './reactIsland';
import { TraceViewer } from '@anytime-markdown/trace-viewer';
import type { TraceViewerProps } from '@anytime-markdown/trace-viewer';
import { PromptManagerIsland } from './PromptManagerIsland';
import type { PromptManagerIslandProps } from './PromptManagerIsland';
import type { VanillaViewHandle } from '../shared/vanillaIsland';
import type { TrailViewerCoreProps } from '../components/TrailViewerCore';
import type { TrailThemeTokens } from '../theme/designTokens';
import { getTrailViewerTabDefs, normalizeTrailInitialTab, isC4RelatedTab } from '../components/trailTabs';
import { buildMessageTree } from '../domain/parser/buildMessageTree';
import { mountAnalyticsPanel } from './analytics/analyticsPanel';
import type { AnalyticsPanelViewProps } from './analytics/analyticsPanel';
import { mountC4Viewer } from './c4/c4Viewer';
import type { C4ViewerViewProps } from './c4/c4Viewer';
import { mountMemoryPanel } from './memory/memoryPanel';
import type { MemoryPanelViewProps } from './memory/memoryPanel';
import { mountLogsTab } from './logs/logsTab';
import { mountFlightReviewPanel, type FlightReviewPanelProps } from './flightReviewPanel';
import { createFlightReviewStore, type FlightReviewStore } from '../data/flightReviewStore';
import type { LogsTabProps } from './logs/logsTab';
import { mountFilterBar } from './filterBar';
import type { FilterBarProps } from './filterBar';
import { mountSessionList } from './sessionList';
import type { SessionListProps } from './sessionList';
import { mountStatsBar } from './statsBar';
import type { StatsBarProps } from './statsBar';
import { mountMessageTimeline } from './messages/messageTimeline';
import type { MessageTimelineViewProps } from './messages/messageTimeline';
import { mountTraceTree } from './messages/traceTree';
import type { TraceTreeProps } from './messages/traceTree';
import { mountReleasesPanel } from './releasesPanel';
import type { ReleasesPanelProps } from './releasesPanel';
import { mountResizablePopup } from './c4/widgets/resizablePopup';
import type { ResizablePopupSize } from './c4/widgets/resizablePopup';
import { mountCallHierarchyPanel } from './c4/panels/callHierarchyPanel';
import type { CallHierarchyPanelVanillaProps } from './c4/panels/callHierarchyPanel';
import { getC4Colors } from '../theme/c4Tokens';
import type { ChatBridge } from '../hooks/useChatBridge';
import type { WsSubscribe } from '../hooks/useLogsDataSource';

// ---------------------------------------------------------------------------
// Inline category context value shapes (mirror analyticsPanel.ts)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Public props contract
// ---------------------------------------------------------------------------

export interface TrailViewerViewProps extends TrailViewerCoreProps {
  /** Resolved i18n function */
  readonly t: (k: string) => string;
  /** Resolved from getTokens(isDark) */
  readonly tokens: TrailThemeTokens;
  /** Resolved category context values */
  readonly toolCategory: ToolCategoryContextValue;
  readonly skillCategory: SkillCategoryContextValue;
  readonly commitCategory: CommitCategoryContextValue;
  /** Optional chat bridge for MemoryPanel (no-op bridge created if absent) */
  readonly bridge?: ChatBridge;
}

// ---------------------------------------------------------------------------
// No-op ChatBridge used when bridge prop is absent
// ---------------------------------------------------------------------------

function makeNoopBridge(): ChatBridge {
  return {
    status: 'unavailable',
    subscribe: () => () => {},
    send: () => {},
    abort: () => {},
    recheck: () => {},
  };
}

// ---------------------------------------------------------------------------
// Session filter helpers (port of TrailViewerCoreInner.visibleSessions)
// ---------------------------------------------------------------------------

import type { TrailSession, TrailFilter } from '../domain/parser/types';

// NEXT_PUBLIC_SHOW_UNLIMITED=1 で 7 日カットオフをバイパスする（旧 TrailViewerCore と同じ）。
// 共有パッケージなので process 未定義環境（一部 webview バンドル）でも落ちないようガードする。
// Next.js（web-app）ではビルド時にインライン展開される。
const SHOW_UNLIMITED_SESSIONS =
  typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SHOW_UNLIMITED === '1';

function computeVisibleSessions(
  sessions: readonly TrailSession[],
  allSessions: readonly TrailSession[] | undefined,
  filter: TrailFilter,
): readonly TrailSession[] {
  let result: readonly TrailSession[] = allSessions ?? sessions;
  const q = filter.searchText?.trim().toLowerCase();
  const skipCutoff = SHOW_UNLIMITED_SESSIONS || !!(q);
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
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

const SESSION_LIST_WIDTH = '280px';

export function mountTrailViewer(
  container: HTMLElement,
  initialProps: TrailViewerViewProps,
): VanillaViewHandle<TrailViewerViewProps> {
  let props = initialProps;
  let destroyed = false;

  const { tokens, t } = props;
  const { colors } = tokens;

  // ── Derived layout options ──
  const hasC4 = () => !!props.c4;
  const hasTrace = () => !!(props.traceFiles || props.c4);

  // ── Tab state ──
  const tabDefs = () => getTrailViewerTabDefs({ hasC4: hasC4(), hasTrace: hasTrace() });
  let activeTab: number = normalizeTrailInitialTab(props.initialTab, { hasC4: hasC4(), hasTrace: hasTrace() });
  const visitedTabs = new Set<number>([activeTab]);

  // ── Popup state ──
  let releasesPopupOpen = false;
  let releasesPopupSize: ResizablePopupSize | null = null;
  let releasesPopupMaximized = false;
  let promptsPopupOpen = false;
  let promptsPopupSize: ResizablePopupSize | null = null;
  let promptsPopupMaximized = false;
  let messagesPopupOpen = props.initialTab === 1;
  let messagesPopupSize: ResizablePopupSize | null = null;
  let messagesPopupMaximized = false;

  // ── Call hierarchy state ──
  let selectedFunctionForTree: { filePath: string; fnName: string; startLine?: number } | null = null;

  // ── Root layout ──
  const root = document.createElement('div');
  root.style.cssText = [
    `display:flex;flex-direction:column;height:${props.containerHeight ?? 'calc(100vh - 64px)'}`,
    `overflow:hidden;background:${colors.midnightNavy}`,
    `color:${colors.textPrimary};position:relative`,
  ].join(';');
  container.appendChild(root);

  // ── aria-live region ──
  const ariaLive = document.createElement('div');
  ariaLive.setAttribute('aria-live', 'polite');
  ariaLive.setAttribute('aria-atomic', 'true');
  ariaLive.style.cssText =
    'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
  root.appendChild(ariaLive);

  // ── Tab bar row ──
  const tabBarRow = document.createElement('div');
  tabBarRow.style.cssText = `border-bottom:1px solid ${colors.border};display:flex;align-items:center;flex-shrink:0;`;
  root.appendChild(tabBarRow);

  // ── Panel container ──
  const panelArea = document.createElement('div');
  panelArea.style.cssText = 'flex:1;overflow:hidden;display:flex;flex-direction:column;position:relative;';
  root.appendChild(panelArea);

  // ── Popup host (appended to document.body for z-index stacking) ──
  // Popups are created on demand and appended to document.body by mountResizablePopup.

  // ── Sub-mount handles (keyed by tab number) ──
  let analyticsHandle: ReturnType<typeof mountAnalyticsPanel> | null = null;
  let c4Handle: ReturnType<typeof mountC4Viewer> | null = null;
  let memoryHandle: ReturnType<typeof mountMemoryPanel> | null = null;
  let logsHandle: ReturnType<typeof mountLogsTab> | null = null;
  let flightReviewHandle: ReturnType<typeof mountFlightReviewPanel> | null = null;
  let flightReviewStore: FlightReviewStore | null = null;
  let callHierarchyHandle: ReturnType<typeof mountCallHierarchyPanel> | null = null;

  // ── React island handles ──
  let traceIsland: ReturnType<typeof mountReactIsland<TraceViewerProps>> | null = null;
  let promptsIsland: ReturnType<typeof mountReactIsland<PromptManagerIslandProps>> | null = null;

  // Panel containers for each tab (keyed by tab index)
  const panelContainers: Record<number, HTMLDivElement> = {};
  function getPanelContainer(tabValue: number): HTMLDivElement {
    if (!panelContainers[tabValue]) {
      const div = document.createElement('div');
      div.setAttribute('role', 'tabpanel');
      div.setAttribute('id', `trail-panel-${tabValue}`);
      div.setAttribute('aria-labelledby', `trail-tab-${tabValue}`);
      div.style.cssText = 'display:none;flex:1;flex-direction:column;overflow:hidden;';
      panelArea.appendChild(div);
      panelContainers[tabValue] = div;
    }
    return panelContainers[tabValue];
  }

  // ── Messages popup content host ──
  let messagesContentHost: HTMLDivElement | null = null;
  let filterBarHandle: ReturnType<typeof mountFilterBar> | null = null;
  let sessionListHandle: ReturnType<typeof mountSessionList> | null = null;
  let messageTimelineHandle: ReturnType<typeof mountMessageTimeline> | null = null;
  let traceTreeHandle: ReturnType<typeof mountTraceTree> | null = null;
  let statsBarHandle: ReturnType<typeof mountStatsBar> | null = null;

  // ── Popup handles ──
  let releasesPopupHandle: ReturnType<typeof mountResizablePopup> | null = null;
  let releasesPopupHost: HTMLDivElement | null = null;
  let promptsPopupHandle: ReturnType<typeof mountResizablePopup> | null = null;
  let promptsPopupHost: HTMLDivElement | null = null;
  let messagesPopupHandle: ReturnType<typeof mountResizablePopup> | null = null;
  let messagesPopupHost: HTMLDivElement | null = null;

  // ── Stable WebSocket subscribe reference for LogsTab ──
  let stableSubscribeToLogs: WsSubscribe | null = null;
  let stableSubscribeUrl: string | null = null;

  // ── Tab bar (created once) ──
  let tabsHandle: ReturnType<typeof createTabs> | null = null;

  function buildTabBar(): void {
    // Destroy old tabs if they exist
    if (tabsHandle) {
      tabsHandle.el.remove();
      tabsHandle = null;
    }

    const defs = tabDefs();
    tabsHandle = createTabs({
      tabs: defs.map((tab) => ({
        value: String(tab.value),
        label: t(tab.i18nKey),
        id: tab.id,
        panelId: tab.panelId,
      })),
      value: String(activeTab),
      onChange: (value) => {
        const tabNum = Number(value);
        visitTab(tabNum);
      },
    });
    tabsHandle.el.style.flex = '1';
    tabBarRow.appendChild(tabsHandle.el);
  }

  function visitTab(tab: number): void {
    activeTab = tab;
    tabsHandle?.update({ value: String(tab) });
    props.onTabVisit?.(tab);
    if (!visitedTabs.has(tab)) {
      visitedTabs.add(tab);
      mountTabPanel(tab);
    }
    updatePanelVisibility();
    updateAriaLive();
  }

  function updatePanelVisibility(): void {
    for (const [tabValueStr, panel] of Object.entries(panelContainers)) {
      const tabValue = Number(tabValueStr);
      const isActive = tabValue === activeTab;
      if (isActive) {
        panel.style.display = 'flex';
        panel.style.flexDirection = 'column';
        panel.style.flex = '1';
      } else {
        panel.style.display = 'none';
      }
    }
  }

  function updateAriaLive(): void {
    const selectedSessionId = props.selectedSessionId;
    const messages = props.messages;
    ariaLive.textContent =
      selectedSessionId && messages.length > 0
        ? `${messages.length} ${t('stats.messages')} ${t('viewer.loaded')}`
        : '';
  }

  // ── Derive TraceViewer props ──
  function buildTraceProps(): TraceViewerProps {
    return {
      traceFiles: props.traceFiles ?? [],
      isDark: props.isDark ?? true,
      onJumpToSource: props.onJumpToSource,
    };
  }

  // ── Derive analytics panel props ──
  function buildAnalyticsProps(): AnalyticsPanelViewProps {
    return {
      analytics: props.analytics ?? null,
      releases: props.releases ?? [],
      sessions: props.allSessions ?? props.sessions,
      sessionsLoading: props.sessionsLoading,
      onSelectSession: props.onSelectSession,
      onJumpToTrace: (session) => {
        const query = session.slug || session.id;
        props.onFilterChange({ ...props.filter, workspace: session.workspace ?? props.filter.workspace, searchText: query });
        props.onSelectSession(session.id);
        openMessagesPopup();
      },
      fetchSessionMessages: props.fetchSessionMessages,
      fetchSessionCommits: props.fetchSessionCommits,
      fetchSessionToolMetrics: props.fetchSessionToolMetrics,
      fetchDayToolMetrics: props.fetchDayToolMetrics,
      costOptimization: props.costOptimization ?? null,
      fetchCombinedData: props.fetchCombinedData,
      fetchQualityMetrics: props.fetchQualityMetrics,
      fetchDeploymentFrequency: props.fetchDeploymentFrequency,
      fetchReleaseQuality: props.fetchReleaseQuality,
      onOpenReleasesPopup: () => { releasesPopupOpen = true; syncReleasesPopup(); },
      onOpenPromptsPopup: () => { props.onPromptsOpen?.(); promptsPopupOpen = true; syncPromptsPopup(); },
      onOpenMessagesPopup: openMessagesPopup,
      tokens: props.tokens,
      t: props.t,
      toolCategory: props.toolCategory,
      skillCategory: props.skillCategory,
      commitCategory: props.commitCategory,
    };
  }

  // ── Derive C4 props ──
  function buildC4Props(): C4ViewerViewProps | null {
    if (!props.c4) return null;
    return {
      ...props.c4,
      isDark: props.isDark,
      containerHeight: '100%',
      onShowSequence: (_elementId: string) => {
        // Activate trace tab
        visitTab(5);
      },
      onOpenFunctionTree: (filePath: string, fnName: string, startLine?: number) => {
        selectedFunctionForTree = { filePath, fnName, startLine };
        visitTab(7);
        if (callHierarchyHandle) {
          callHierarchyHandle.update(buildCallHierarchyProps());
        }
      },
      t: props.t,
    };
  }

  // ── Derive CallHierarchy props ──
  function buildCallHierarchyProps(): CallHierarchyPanelVanillaProps {
    const c4Colors = getC4Colors(props.isDark ?? true);
    const tokenColors = props.tokens.colors;
    return {
      rootFunction: selectedFunctionForTree,
      apiBaseUrl: props.c4?.serverUrl ?? props.serverUrl ?? '',
      t: props.t,
      isDark: props.isDark ?? true,
      colors: {
        border: c4Colors.border,
        textPrimary: tokenColors.textPrimary,
        textSecondary: c4Colors.textSecondary,
        error: tokenColors.error,
      },
    };
  }

  // ── Derive MemoryPanel props ──
  function buildMemoryProps(): MemoryPanelViewProps {
    return {
      serverUrl: props.serverUrl ?? '',
      tokens: props.tokens,
      isDark: props.isDark ?? true,
      t: props.t,
      bridge: props.bridge ?? makeNoopBridge(),
      onOpenSessionMessages: (sessionId: string) => {
        const allSessions = props.allSessions ?? props.sessions;
        const session = allSessions.find((s) => s.id === sessionId);
        const query = session?.slug || sessionId;
        props.onFilterChange({
          ...props.filter,
          ...(session?.workspace ? { workspace: session.workspace } : {}),
          searchText: query,
        });
        props.onSelectSession(sessionId);
        openMessagesPopup();
      },
    };
  }

  // ── Derive FlightReviewPanel props（Phase 6 S3） ──
  function buildFlightReviewProps(): FlightReviewPanelProps {
    // store はタブ初回マウント時に一度だけ作り、destroy まで使い回す
    flightReviewStore ??= createFlightReviewStore(props.serverUrl ?? '', { enabled: true });
    return {
      isDark: props.isDark ?? true,
      tokens: props.tokens,
      t: props.t,
      store: flightReviewStore,
    };
  }

  // ── Derive LogsTab props ──
  function buildLogsProps(): LogsTabProps {
    const serverUrl = props.serverUrl ?? '';
    // Recreate subscribe fn only when serverUrl actually changes
    if (stableSubscribeToLogs === null || serverUrl !== stableSubscribeUrl) {
      stableSubscribeUrl = serverUrl;
      stableSubscribeToLogs = (handler) => {
        if (!serverUrl) return () => {};
        const wsUrl = serverUrl.replace(/^http/, 'ws');
        const ws = new WebSocket(wsUrl);
        ws.addEventListener('message', (ev) => {
          try {
            const data = typeof ev.data === 'string' ? ev.data : '';
            const msg = JSON.parse(data) as { type?: string };
            if (msg && msg.type === 'log-batch') {
              handler(msg as never);
            }
          } catch {
            /* noop */
          }
        });
        return () => ws.close();
      };
    }
    return {
      baseUrl: serverUrl,
      subscribe: stableSubscribeToLogs,
      t: props.t,
    };
  }

  // ── Build messages content into a container ──
  // 差分 update 用に traceTree 領域のコンテナを保持する（構造が変わる唯一の領域）。
  let messagesTraceTreeContainer: HTMLDivElement | null = null;

  // ── prop ビルダー（build と差分 update で共有し二重定義を避ける） ──
  function filterBarPropsOf(): FilterBarProps {
    const { colors } = props.tokens;
    return {
      t: props.t,
      filter: props.filter,
      sessions: props.allSessions ?? props.sessions,
      onChange: (f) => props.onFilterChange(f),
      colors: {
        midnightNavy: colors.midnightNavy,
        border: colors.border,
        textSecondary: colors.textSecondary,
      },
    };
  }
  function sessionListPropsOf(): SessionListProps {
    const { colors } = props.tokens;
    return {
      t: props.t,
      sessions: computeVisibleSessions(props.sessions, props.allSessions, props.filter),
      selectedId: props.selectedSessionId,
      onSelect: props.onSelectSession,
      colors: { textSecondary: colors.textSecondary, iceBlue: colors.iceBlue },
    };
  }
  function timelinePropsOf(messageTree: ReturnType<typeof buildMessageTree>, selectedSession: TrailSession | undefined): MessageTimelineViewProps {
    return {
      t: props.t,
      nodes: messageTree,
      session: selectedSession,
      onSelectMessage: () => { /* scroll handled inside */ },
    };
  }
  function statsPropsOf(selectedSession: TrailSession | undefined): StatsBarProps {
    const { colors } = props.tokens;
    return {
      t: props.t,
      session: selectedSession,
      messages: props.messages,
      colors: {
        border: colors.border,
        charcoal: colors.charcoal,
        textSecondary: colors.textSecondary,
        iceBlue: colors.iceBlue,
        error: colors.error,
        success: colors.success,
      },
    };
  }

  /** traceTree 領域（TraceTree ⇄ 空状態）を再構築する。構造が selectedSession/messages で変わるため。 */
  function renderTraceTreeArea(messageTree: ReturnType<typeof buildMessageTree>): void {
    const container = messagesTraceTreeContainer;
    if (!container) return;
    traceTreeHandle?.destroy();
    traceTreeHandle = null;
    container.replaceChildren();
    const { colors } = props.tokens;
    if (props.selectedSessionId && props.messages.length > 0) {
      traceTreeHandle = mountTraceTree(container, { t: props.t, nodes: messageTree });
    } else {
      const emptyEl = document.createElement('div');
      emptyEl.style.cssText = 'display:flex;align-items:center;justify-content:center;flex:1;height:100%;';
      const emptyText = document.createElement('span');
      emptyText.style.cssText = `font-size:0.875rem;color:${colors.textSecondary};`;
      emptyText.textContent = props.selectedSessionId ? props.t('viewer.loading') : props.t('viewer.selectSession');
      emptyEl.appendChild(emptyText);
      container.appendChild(emptyEl);
    }
  }

  function buildMessagesContent(contentEl: HTMLElement): void {
    const { colors } = props.tokens;

    // FilterBar
    const filterBarContainer = document.createElement('div');
    filterBarContainer.style.cssText = 'flex-shrink:0;';
    contentEl.appendChild(filterBarContainer);
    filterBarHandle = mountFilterBar(filterBarContainer, filterBarPropsOf());

    // Middle row: SessionList + MessageTimeline + TraceTree
    const middleRow = document.createElement('div');
    middleRow.style.cssText = 'display:flex;flex:1;overflow:hidden;';
    contentEl.appendChild(middleRow);

    // Session list panel
    const sessionListPanel = document.createElement('div');
    sessionListPanel.style.cssText = [
      `width:${SESSION_LIST_WIDTH};min-width:${SESSION_LIST_WIDTH}`,
      `border-right:1px solid ${colors.border}`,
      'overflow-y:auto;',
    ].join(';');
    middleRow.appendChild(sessionListPanel);
    sessionListHandle = mountSessionList(sessionListPanel, sessionListPropsOf());

    // Right content: MessageTimeline + TraceTree
    const rightPanel = document.createElement('div');
    rightPanel.style.cssText = 'flex:1;overflow:hidden;display:flex;flex-direction:column;';
    middleRow.appendChild(rightPanel);

    const messageTree = buildMessageTree(props.messages);
    const selectedSession = (props.allSessions ?? props.sessions).find((s) => s.id === props.selectedSessionId);

    const timelineContainer = document.createElement('div');
    rightPanel.appendChild(timelineContainer);
    messageTimelineHandle = mountMessageTimeline(timelineContainer, timelinePropsOf(messageTree, selectedSession));

    // TraceTree or empty state
    const traceTreeContainer = document.createElement('div');
    traceTreeContainer.style.cssText = 'flex:1;overflow:auto;';
    rightPanel.appendChild(traceTreeContainer);
    messagesTraceTreeContainer = traceTreeContainer;
    renderTraceTreeArea(messageTree);

    // StatsBar
    const statsBarContainer = document.createElement('div');
    contentEl.appendChild(statsBarContainer);
    statsBarHandle = mountStatsBar(statsBarContainer, statsPropsOf(selectedSession));
  }

  function destroyMessagesContent(): void {
    filterBarHandle?.destroy();
    filterBarHandle = null;
    sessionListHandle?.destroy();
    sessionListHandle = null;
    messageTimelineHandle?.destroy();
    messageTimelineHandle = null;
    traceTreeHandle?.destroy();
    traceTreeHandle = null;
    statsBarHandle?.destroy();
    statsBarHandle = null;
    messagesTraceTreeContainer = null;
    if (messagesContentHost) {
      messagesContentHost.replaceChildren();
    }
  }

  function updateMessagesContent(): void {
    if (!messagesContentHost) return;
    // 未 mount なら初回構築。以降は差分 update（全破棄→再構築だと検索入力が毎キーで
    // 消えフォーカスを失う回帰になるため、各 handle の update と traceTree 領域のみ再描画にする）。
    if (!filterBarHandle) {
      buildMessagesContent(messagesContentHost);
      return;
    }
    const messageTree = buildMessageTree(props.messages);
    const selectedSession = (props.allSessions ?? props.sessions).find((s) => s.id === props.selectedSessionId);
    filterBarHandle.update(filterBarPropsOf());
    sessionListHandle?.update(sessionListPropsOf());
    messageTimelineHandle?.update(timelinePropsOf(messageTree, selectedSession));
    renderTraceTreeArea(messageTree);
    statsBarHandle?.update(statsPropsOf(selectedSession));
  }

  // ── Open/close popup helpers ──
  function openMessagesPopup(): void {
    messagesPopupOpen = true;
    syncMessagesPopup();
  }

  function syncReleasesPopup(): void {
    if (releasesPopupOpen && !releasesPopupHandle) {
      const c4Colors = getC4Colors(props.isDark ?? true);
      const host = document.createElement('div');
      // trail-viewer ルート(position:relative+overflow:hidden)へ append し、ポップアップを
      // trail-viewer 内に収める。document.body 直下だと埋込(ランディングページ等)で
      // ページ全体を覆ってしまう。
      root.appendChild(host);
      releasesPopupHost = host;

      const releaseProps: ReleasesPanelProps = {
        releases: props.releases ?? [],
        t: props.t,
        commitColors: {
          feat: props.tokens.commitCategoryColors?.[0] ?? '#66BB6A',
          fix: props.tokens.commitCategoryColors?.[1] ?? '#EF5350',
          refactor: props.tokens.commitCategoryColors?.[2] ?? '#9E9E9E',
          test: props.tokens.commitCategoryColors?.[3] ?? '#FFA726',
          other: props.tokens.commitCategoryColors?.[4] ?? '#78909C',
        },
      };

      releasesPopupHandle = mountResizablePopup(host, {
        title: t('viewer.tab.releases'),
        ariaLabel: t('viewer.tab.releases'),
        onClose: () => {
          releasesPopupOpen = false;
          releasesPopupHandle?.destroy();
          releasesPopupHandle = null;
          host.remove();
          releasesPopupHost = null;
        },
        isDark: props.isDark ?? true,
        colors: c4Colors,
        size: releasesPopupSize,
        onSizeChange: (s) => { releasesPopupSize = s; },
        maximized: releasesPopupMaximized,
        onMaximizedChange: (m) => { releasesPopupMaximized = m; },
        defaultMaxWidth: 1120,
        centered: true,
        withBackdrop: true,
        i18nMaximize: t('c4.popup.maximize'),
        i18nRestore: t('c4.popup.restore'),
        i18nClose: t('c4.popup.close'),
        i18nResize: t('c4.popup.resize'),
        mountContent: (contentContainer) => mountReleasesPanel(contentContainer, releaseProps),
      });
    }
  }

  function syncPromptsPopup(): void {
    if (promptsPopupOpen && !promptsPopupHandle) {
      const c4Colors = getC4Colors(props.isDark ?? true);
      const host = document.createElement('div');
      // trail-viewer ルート(position:relative+overflow:hidden)へ append し、ポップアップを
      // trail-viewer 内に収める。document.body 直下だと埋込(ランディングページ等)で
      // ページ全体を覆ってしまう。
      root.appendChild(host);
      promptsPopupHost = host;

      promptsPopupHandle = mountResizablePopup(host, {
        title: t('viewer.tab.prompts'),
        ariaLabel: t('viewer.tab.prompts'),
        onClose: () => {
          promptsPopupOpen = false;
          promptsIsland?.destroy();
          promptsIsland = null;
          promptsPopupHandle?.destroy();
          promptsPopupHandle = null;
          host.remove();
          promptsPopupHost = null;
        },
        isDark: props.isDark ?? true,
        colors: c4Colors,
        size: promptsPopupSize,
        onSizeChange: (s) => { promptsPopupSize = s; },
        maximized: promptsPopupMaximized,
        onMaximizedChange: (m) => { promptsPopupMaximized = m; },
        defaultMaxWidth: 1120,
        centered: true,
        withBackdrop: true,
        i18nMaximize: t('c4.popup.maximize'),
        i18nRestore: t('c4.popup.restore'),
        i18nClose: t('c4.popup.close'),
        i18nResize: t('c4.popup.resize'),
        mountContent: (contentContainer) => {
          const pmProps: PromptManagerIslandProps = {
            prompts: props.prompts ?? [],
            isDark: props.isDark ?? true,
            locale: props.locale,
          };
          promptsIsland = mountReactIsland(contentContainer, PromptManagerIsland, pmProps);
        },
      });
    }
  }

  function syncMessagesPopup(): void {
    if (messagesPopupOpen && !messagesPopupHandle) {
      const c4Colors = getC4Colors(props.isDark ?? true);
      const host = document.createElement('div');
      // trail-viewer ルート(position:relative+overflow:hidden)へ append し、ポップアップを
      // trail-viewer 内に収める。document.body 直下だと埋込(ランディングページ等)で
      // ページ全体を覆ってしまう。
      root.appendChild(host);
      messagesPopupHost = host;

      messagesContentHost = document.createElement('div');
      messagesContentHost.style.cssText = 'display:flex;flex-direction:column;height:100%;';

      messagesPopupHandle = mountResizablePopup(host, {
        title: t('viewer.tab.messages'),
        ariaLabel: t('viewer.tab.messages'),
        onClose: () => {
          messagesPopupOpen = false;
          destroyMessagesContent();
          messagesPopupHandle?.destroy();
          messagesPopupHandle = null;
          host.remove();
          messagesPopupHost = null;
          messagesContentHost = null;
        },
        isDark: props.isDark ?? true,
        colors: c4Colors,
        size: messagesPopupSize,
        onSizeChange: (s) => { messagesPopupSize = s; },
        maximized: messagesPopupMaximized,
        onMaximizedChange: (m) => { messagesPopupMaximized = m; },
        defaultMaxWidth: 1280,
        centered: true,
        withBackdrop: true,
        i18nMaximize: t('c4.popup.maximize'),
        i18nRestore: t('c4.popup.restore'),
        i18nClose: t('c4.popup.close'),
        i18nResize: t('c4.popup.resize'),
        mountContent: (contentContainer) => {
          if (messagesContentHost) {
            contentContainer.appendChild(messagesContentHost);
            buildMessagesContent(messagesContentHost);
          }
        },
      });
    }
  }

  // ── Mount a tab panel lazily ──
  function mountTabPanel(tab: number): void {
    const panelEl = getPanelContainer(tab);

    switch (tab) {
      case 0: {
        if (!analyticsHandle) {
          analyticsHandle = mountAnalyticsPanel(panelEl, buildAnalyticsProps());
        }
        break;
      }
      case 4: {
        if (!c4Handle) {
          const c4Props = buildC4Props();
          if (c4Props) {
            c4Handle = mountC4Viewer(panelEl, c4Props);
          }
        }
        break;
      }
      case 5: {
        if (!traceIsland && (props.traceFiles || props.c4)) {
          const traceProps = buildTraceProps();
          traceIsland = mountReactIsland(panelEl, TraceViewer, traceProps);
        }
        break;
      }
      case 6: {
        if (!memoryHandle) {
          memoryHandle = mountMemoryPanel(panelEl, buildMemoryProps());
        }
        break;
      }
      case 7: {
        if (!callHierarchyHandle) {
          callHierarchyHandle = mountCallHierarchyPanel(panelEl, buildCallHierarchyProps());
        }
        break;
      }
      case 8: {
        if (!logsHandle && props.serverUrl) {
          logsHandle = mountLogsTab(panelEl, buildLogsProps());
        }
        break;
      }
      case 9: {
        if (!flightReviewHandle && props.serverUrl) {
          flightReviewHandle = mountFlightReviewPanel(panelEl, buildFlightReviewProps());
        }
        break;
      }
    }
  }

  // ── Initial render ──
  buildTabBar();
  // Notify parent of initial tab visit
  props.onTabVisit?.(activeTab);
  // Mount initial panel
  mountTabPanel(activeTab);
  updatePanelVisibility();
  updateAriaLive();

  // Open messages popup if initialTab === 1
  if (messagesPopupOpen) {
    syncMessagesPopup();
  }

  // ── Update ──
  function update(newProps: TrailViewerViewProps): void {
    if (destroyed) return;

    const prevC4 = !!props.c4;
    const prevTrace = !!(props.traceFiles || props.c4);
    props = newProps;

    const newC4 = !!props.c4;
    const newTrace = !!(props.traceFiles || props.c4);

    // Rebuild tab bar if c4/trace availability changed
    if (prevC4 !== newC4 || prevTrace !== newTrace) {
      buildTabBar();
      // Re-normalize active tab if needed
      const validTabs = tabDefs().map((t) => t.value);
      if (!validTabs.includes(activeTab as 0)) {
        activeTab = 0;
      }
      updatePanelVisibility();
    } else {
      tabsHandle?.update({ value: String(activeTab) });
    }

    // Update root height
    root.style.height = props.containerHeight ?? 'calc(100vh - 64px)';

    // Update sub-mounts that are already alive
    if (analyticsHandle) {
      analyticsHandle.update(buildAnalyticsProps());
    }
    if (c4Handle) {
      const c4Props = buildC4Props();
      if (c4Props) c4Handle.update(c4Props);
    }
    if (memoryHandle) {
      memoryHandle.update(buildMemoryProps());
    }
    if (logsHandle) {
      logsHandle.update(buildLogsProps());
    }
    if (flightReviewHandle) {
      flightReviewHandle.update(buildFlightReviewProps());
    }
    if (callHierarchyHandle) {
      callHierarchyHandle.update(buildCallHierarchyProps());
    }
    if (traceIsland) {
      traceIsland.update(buildTraceProps());
    }
    if (promptsIsland) {
      const pmProps: PromptManagerIslandProps = {
        prompts: props.prompts ?? [],
        isDark: props.isDark ?? true,
        locale: props.locale,
      };
      promptsIsland.update(pmProps);
    }

    // Update messages popup content
    if (messagesPopupOpen && messagesContentHost) {
      updateMessagesContent();
    }

    updateAriaLive();
  }

  // ── Destroy ──
  function destroy(): void {
    if (destroyed) return;
    destroyed = true;

    analyticsHandle?.destroy();
    c4Handle?.destroy();
    memoryHandle?.destroy();
    logsHandle?.destroy();
    flightReviewHandle?.destroy();
    flightReviewHandle = null;
    flightReviewStore?.dispose();
    flightReviewStore = null;
    callHierarchyHandle?.destroy();
    traceIsland?.destroy();
    traceIsland = null;
    promptsIsland?.destroy();
    promptsIsland = null;

    destroyMessagesContent();
    releasesPopupHandle?.destroy();
    releasesPopupHost?.remove();
    releasesPopupHost = null;
    promptsPopupHandle?.destroy();
    promptsPopupHost?.remove();
    promptsPopupHost = null;
    messagesPopupHandle?.destroy();
    messagesPopupHost?.remove();
    messagesPopupHost = null;

    tabsHandle?.el.remove();
    root.remove();
  }

  return { update, destroy };
}
