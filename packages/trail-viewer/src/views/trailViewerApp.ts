/**
 * TrailViewerApp vanilla DOM factory.
 *
 * Reproduces TrailViewerApp.tsx as a framework-free factory.
 * `mountTrailViewerApp(container, props)` → VanillaViewHandle<TrailViewerAppViewProps>
 *
 * Owns:
 *  - TrailDataStore, C4DataStore, TraceFilesStore subscriptions
 *  - Category map fetch (commit/tool/skill)
 *  - Token + i18n resolution
 *  - Delegates all UI to mountTrailViewer
 */

import type { VanillaViewHandle } from '../shared/vanillaIsland';
import type { DocLink } from '@anytime-markdown/trail-core/c4';
import type { TrailLocale } from '../i18n';
import { getTokens } from '../theme/designTokens';
import { createTrailDataStore } from '../hooks/stores/trailDataStore';
import { createC4DataStore } from '../c4/hooks/stores/c4DataStore';
import { createTraceFilesStore } from '../hooks/stores/traceFilesStore';

import { DEFAULT_COMMIT_CATEGORIES, DEFAULT_COMMIT_CATEGORY_LABELS } from '@anytime-markdown/trail-core/commitCategories';
import { DEFAULT_TOOL_CATEGORIES, DEFAULT_TOOL_CATEGORY_LABELS, resolveToolCategory } from '@anytime-markdown/trail-core/toolCategories';
import { DEFAULT_SKILL_CATEGORIES, DEFAULT_SKILL_CATEGORY_LABELS, resolveSkillCategory } from '@anytime-markdown/trail-core/skillCategories';

import type { TrailFilter } from '../domain/parser/types';
import type { ElementFormData, RelationshipFormData } from '../c4/components/dialogs/C4EditDialogs';
import { mountTrailViewer } from './trailViewer';
import type { TrailViewerViewProps } from './trailViewer';
import { isC4RelatedTab, isMemoryTab } from '../components/trailTabs';
import { createChatBridge, type ChatBridgeStore } from '../hooks/createChatBridge';
import { en } from '../i18n/en';
import { ja } from '../i18n/ja';
import type { TrailI18n } from '../i18n/types';

// ---------------------------------------------------------------------------
// Public props contract
// ---------------------------------------------------------------------------

export interface TrailViewerAppViewProps {
  readonly serverUrl: string;
  readonly isDark?: boolean;
  readonly locale?: TrailLocale;
  readonly containerHeight?: string;
  readonly editable?: boolean;
  readonly onDocLinkClick?: (doc: DocLink) => void;
  readonly initialTab?: number;
  readonly initialC4Level?: number;
  readonly disableWebSocket?: boolean;
}

// ---------------------------------------------------------------------------
// i18n factory
// ---------------------------------------------------------------------------

function createTrailI18n(locale?: TrailLocale): (k: string) => string {
  const dict: TrailI18n = locale === 'ja' ? ja : en;
  return (k: string) => (dict as unknown as Record<string, string>)[k] ?? k;
}

// ---------------------------------------------------------------------------
// Category context value builders
// ---------------------------------------------------------------------------

function generateOverflowColor(index: number, isDark: boolean): string {
  const hue = Math.round((index * 137.508) % 360);
  return isDark ? `hsl(${hue}, 55%, 65%)` : `hsl(${hue}, 50%, 40%)`;
}

function buildToolCategoryContext(
  categories: ReadonlyMap<string, number>,
  labels: ReadonlyMap<number, string>,
  toolCategoryColors: readonly string[],
  isDark: boolean,
) {
  const keys = Array.from(labels.keys()).sort((a, b) => a - b);
  const getColorByIndex = (cat: number): string =>
    toolCategoryColors[cat] ?? generateOverflowColor(cat, isDark);
  return {
    getToolCategory: (toolName: string) => resolveToolCategory(toolName, categories),
    getToolCategoryColor: (toolName: string) => {
      const cat = resolveToolCategory(toolName, categories);
      return getColorByIndex(cat);
    },
    getToolCategoryLabel: (cat: number) => labels.get(cat) ?? 'その他',
    getToolCategoryColorByIndex: getColorByIndex,
    toolCategoryKeys: keys,
  };
}

function buildSkillCategoryContext(
  categories: ReadonlyMap<string, number>,
  labels: ReadonlyMap<number, string>,
  skillCategoryColors: readonly string[],
  isDark: boolean,
) {
  const keys = Array.from(labels.keys()).sort((a, b) => a - b);
  const getColorByIndex = (cat: number): string =>
    skillCategoryColors[cat] ?? generateOverflowColor(cat, isDark);
  return {
    getSkillCategory: (skillName: string) => resolveSkillCategory(skillName, categories),
    getSkillCategoryColor: (skillName: string) => {
      const cat = resolveSkillCategory(skillName, categories);
      return getColorByIndex(cat);
    },
    getSkillCategoryLabel: (cat: number) => labels.get(cat) ?? 'その他',
    getSkillCategoryColorByIndex: getColorByIndex,
    skillCategoryKeys: keys,
  };
}

function buildCommitCategoryContext(
  categories: ReadonlyMap<string, number>,
  labels: ReadonlyMap<number, string>,
  commitCategoryColors: readonly string[],
  isDark: boolean,
) {
  const keys = Array.from(labels.keys()).sort((a, b) => a - b);
  const getColorByIndex = (cat: number): string =>
    commitCategoryColors[cat] ?? generateOverflowColor(cat, isDark);
  return {
    getCategory: (prefix: string) => {
      const fallback = keys.at(-1) ?? 2;
      return categories.get(prefix) ?? fallback;
    },
    getCategoryColor: (prefix: string) => {
      const fallback = keys.at(-1) ?? 2;
      const cat = categories.get(prefix) ?? fallback;
      return getColorByIndex(cat);
    },
    getCategoryLabel: (cat: number) => labels.get(cat) ?? 'その他',
    getCategoryColorByIndex: getColorByIndex,
    categoryKeys: keys,
  };
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

const EMPTY_FILTER: TrailFilter = { searchText: undefined, workspace: undefined };

export function mountTrailViewerApp(
  container: HTMLElement,
  initialProps: TrailViewerAppViewProps,
): VanillaViewHandle<TrailViewerAppViewProps> {
  let props = initialProps;
  let destroyed = false;

  // ── Lazy enable flags (mirror TrailViewerApp.tsx useState) ──
  let c4Enabled = false;
  let promptsEnabled = false;

  // ── Chat bridge（Memory タブ初回訪問で遅延生成。旧 MemoryPanel の useChatBridge 相当） ──
  let chatBridgeStore: ChatBridgeStore | null = null;

  // ── Category state ──
  let commitCategories: ReadonlyMap<string, number> = DEFAULT_COMMIT_CATEGORIES;
  let commitCategoryLabels: ReadonlyMap<number, string> = DEFAULT_COMMIT_CATEGORY_LABELS;
  let toolCategories: ReadonlyMap<string, number> = DEFAULT_TOOL_CATEGORIES;
  let toolCategoryLabels: ReadonlyMap<number, string> = DEFAULT_TOOL_CATEGORY_LABELS;
  let skillCategories: ReadonlyMap<string, number> = DEFAULT_SKILL_CATEGORIES;
  let skillCategoryLabels: ReadonlyMap<number, string> = DEFAULT_SKILL_CATEGORY_LABELS;

  // ── Filter + selection state ──
  let filter: TrailFilter = EMPTY_FILTER;
  let selectedSessionId: string | undefined;
  // 旧 TrailViewerApp.tsx: initialTab===1（Messages 起点）で最初のセッションを一度だけ自動選択する。
  // これが無いと press 埋め込み等で右ペインが「セッションを選択してください」の空状態で始まる。
  let didAutoSelect = false;

  // ── Stores ──
  const trailStore = createTrailDataStore(props.serverUrl, { promptsEnabled });
  const c4Store = createC4DataStore(props.serverUrl, props.disableWebSocket ?? false, c4Enabled);
  const traceStore = createTraceFilesStore(async () => {
    const res = await fetch(`${props.serverUrl}/api/trace/list`);
    if (!res.ok) throw new Error(`trace/list: ${res.status}`);
    return res.json() as Promise<{ name: string; url: string }[]>;
  });

  // ── Category config fetches ──
  let cancelCommit = false;
  let cancelTool = false;
  let cancelSkill = false;

  void (async () => {
    try {
      const res = await fetch(`${props.serverUrl}/api/config/commit-categories`);
      if (!res.ok || cancelCommit || destroyed) return;
      const json = await res.json() as { entries?: Record<string, number>; categories?: Record<string, string> };
      if (cancelCommit || destroyed || typeof json !== 'object' || json === null) return;
      if (json.entries) commitCategories = new Map(Object.entries(json.entries) as [string, number][]);
      if (json.categories) commitCategoryLabels = new Map(Object.entries(json.categories).map(([k, v]) => [Number(k), v]));
      notifyUpdate();
    } catch {
      /* サーバーが未対応の場合はデフォルトのままにする */
    }
  })();

  void (async () => {
    try {
      const res = await fetch(`${props.serverUrl}/api/config/tool-categories`);
      if (!res.ok || cancelTool || destroyed) return;
      const json = await res.json() as { entries?: Record<string, number>; categories?: Record<string, string> };
      if (cancelTool || destroyed || typeof json !== 'object' || json === null) return;
      if (json.entries) toolCategories = new Map(Object.entries(json.entries) as [string, number][]);
      if (json.categories) toolCategoryLabels = new Map(Object.entries(json.categories).map(([k, v]) => [Number(k), v]));
      notifyUpdate();
    } catch {
      /* サーバーが未対応の場合はデフォルトのままにする */
    }
  })();

  void (async () => {
    try {
      const res = await fetch(`${props.serverUrl}/api/config/skill-categories`);
      if (!res.ok || cancelSkill || destroyed) return;
      const json = await res.json() as { entries?: Record<string, number>; categories?: Record<string, string> };
      if (cancelSkill || destroyed || typeof json !== 'object' || json === null) return;
      if (json.entries) skillCategories = new Map(Object.entries(json.entries) as [string, number][]);
      if (json.categories) skillCategoryLabels = new Map(Object.entries(json.categories).map(([k, v]) => [Number(k), v]));
      notifyUpdate();
    } catch {
      /* サーバーが未対応の場合はデフォルトのままにする */
    }
  })();

  // ── Subscribe to stores ──
  const unsubTrail = trailStore.subscribe(notifyUpdate);
  const unsubC4 = c4Store.subscribe(notifyUpdate);
  const unsubTrace = traceStore.subscribe(notifyUpdate);

  // ── Build combined props ──
  function buildViewerProps(): TrailViewerViewProps {
    const isDark = props.isDark ?? true;
    const tokens = getTokens(isDark);
    const t = createTrailI18n(props.locale);

    const trail = trailStore.getState();
    const c4 = c4Store.getState();
    const traceFiles = traceStore.getState();

    const toolCategory = buildToolCategoryContext(toolCategories, toolCategoryLabels, tokens.toolCategoryColors, isDark);
    const skillCategory = buildSkillCategoryContext(skillCategories, skillCategoryLabels, tokens.skillCategoryColors, isDark);
    const commitCategory = buildCommitCategoryContext(commitCategories, commitCategoryLabels, tokens.commitCategoryColors, isDark);

    const effectiveEditable = (props.editable ?? false) && !!c4.selectedRepo;

    const handleDocLinkClick = (doc: DocLink) => {
      if (props.onDocLinkClick) {
        props.onDocLinkClick(doc);
      } else {
        c4.sendCommand('open-doc-link', { path: doc.path });
      }
    };

    const c4Props = {
      c4Model: c4.c4Model,
      boundaries: c4.boundaries,
      featureMatrix: c4.featureMatrix,
      dsmMatrix: c4.dsmMatrix,
      coverageMatrix: c4.coverageMatrix,
      coverageDiff: c4.coverageDiff,
      complexityMatrix: c4.complexityMatrix,
      importanceMatrix: c4.importanceMatrix,
      deadCodeMatrix: c4.deadCodeMatrix,
      centralityMatrix: c4.centralityMatrix,
      roleMatrix: c4.roleMatrix,
      fileAnalysisEntries: c4.fileAnalysisEntries,
      functionAnalysisEntries: c4.functionAnalysisEntries,
      docLinks: c4.docLinks,
      connected: c4.connected,
      analysisProgress: c4.analysisProgress,
      releases: c4.releases,
      selectedRelease: c4.selectedRelease,
      onReleaseSelect: c4.setSelectedRelease,
      selectedRepo: c4.selectedRepo,
      onRepoSelect: c4.setSelectedRepo,
      onAddElement: effectiveEditable
        ? (data: ElementFormData) => void c4.addElement({ type: data.type, name: data.name, description: data.description || undefined, external: data.external, parentId: data.parentId ?? null, serviceType: data.serviceType })
        : undefined,
      onUpdateElement: effectiveEditable
        ? (id: string, data: ElementFormData) => void c4.updateElement(id, { name: data.name, description: data.description || undefined, external: data.external })
        : undefined,
      onAddRelationship: effectiveEditable
        ? (data: RelationshipFormData) => void c4.addRelationship({ fromId: data.from, toId: data.to, label: data.label || undefined, technology: data.technology || undefined })
        : undefined,
      onRemoveElement: effectiveEditable
        ? (id: string) => void c4.removeElement(id)
        : undefined,
      onDocLinkClick: handleDocLinkClick,
      onOpenFile: (filePath: string) => { c4.sendCommand('open-file', { filePath }); },
      // Web 単体モード（WebSocket 無効）では未配線にしてメニュー項目を出さない
      onExportToNote: props.disableWebSocket
        ? undefined
        : (payload) => { c4.sendCommand('add-note-page', payload); },
      serverUrl: props.serverUrl,
      claudeActivity: c4.claudeActivity,
      multiAgentActivity: c4.multiAgentActivity,
      onResetClaudeActivity: () => { c4.sendCommand('reset-claude-activity'); },
      manualGroups: c4.manualGroups,
      initialLevel: props.initialC4Level,
    };

    return {
      isDark,
      locale: props.locale,
      sessions: trail.sessions,
      allSessions: trail.allSessions,
      selectedSessionId,
      messages: trail.messages,
      filter,
      onSelectSession: (id: string) => {
        selectedSessionId = id;
        trail.loadSession(id);
        notifyUpdate();
      },
      onFilterChange: (f: TrailFilter) => {
        filter = f;
        trail.searchSessions(f);
        notifyUpdate();
      },
      containerHeight: props.containerHeight,
      prompts: trail.prompts,
      analytics: trail.analytics,
      fetchSessionMessages: trail.fetchSessionMessages,
      fetchSessionCommits: trail.fetchSessionCommits,
      fetchSessionToolMetrics: trail.fetchSessionToolMetrics,
      fetchDayToolMetrics: trail.fetchDayToolMetrics,
      costOptimization: trail.costOptimization,
      releases: trail.releases,
      fetchCombinedData: trail.fetchCombinedData,
      fetchQualityMetrics: trail.fetchQualityMetrics,
      fetchDeploymentFrequency: trail.fetchDeploymentFrequency,
      fetchReleaseQuality: trail.fetchReleaseQuality,
      sessionsLoading: trail.sessionsLoading,
      c4: c4Props,
      traceFiles: traceFiles.length > 0 ? traceFiles : undefined,
      initialTab: props.initialTab,
      onTabVisit: (tab: number) => {
        if (isC4RelatedTab(tab)) {
          c4Enabled = true;
          // store は enabled=false で生成されているため、訪問時に有効化して
          // 初回 fetch + WS 接続を起動する（これが無いと C4 モデルが永久に空になる）。
          c4Store.setEnabled(true);
        }
        if (isMemoryTab(tab)) {
          // Memory タブ初回訪問で ChatBridge を生成し WS 接続する（これが無いと Chat タブが
          // 常時「接続不可」になる。旧 MemoryPanel の useChatBridge(serverUrl) 相当）。
          ensureChatBridge();
        }
      },
      onPromptsOpen: () => {
        promptsEnabled = true;
        // store は promptsEnabled=false で生成されているため、初回オープン時に有効化して
        // prompts を取得する（これが無いと Prompts ポップアップが空になる）。
        trailStore.setPromptsEnabled(true);
      },
      sendCommand: c4.sendCommand,
      wsConnected: c4.connected,
      serverUrl: props.serverUrl,
      bridge: chatBridgeStore ? chatBridgeStore.getSnapshot() : undefined,
      commitCategories,
      commitCategoryLabels,
      toolCategories,
      toolCategoryLabels,
      skillCategories,
      skillCategoryLabels,
      tokens,
      t,
      toolCategory,
      skillCategory,
      commitCategory,
    };
  }

  // ── Initial inner mount ──
  let innerHandle = mountTrailViewer(container, buildViewerProps());

  /** Memory タブ初回訪問で ChatBridge を生成する（一度だけ。WS 接続 + 再描画）。 */
  function ensureChatBridge(): void {
    if (chatBridgeStore || destroyed) return;
    chatBridgeStore = createChatBridge(props.serverUrl, notifyUpdate);
    notifyUpdate();
  }

  /** initialTab===1 のとき最初のセッションを一度だけ自動選択する（旧 didAutoSelect ロジック）。 */
  function maybeAutoSelectFirstSession(): void {
    if (didAutoSelect || props.initialTab !== 1 || selectedSessionId) return;
    const trail = trailStore.getState();
    const first = (trail.allSessions ?? trail.sessions)[0];
    if (!first) return;
    didAutoSelect = true;
    selectedSessionId = first.id;
    trail.loadSession(first.id);
  }

  function notifyUpdate(): void {
    if (destroyed) return;
    maybeAutoSelectFirstSession();
    innerHandle.update(buildViewerProps());
  }

  return {
    update(newProps: TrailViewerAppViewProps) {
      props = newProps;
      notifyUpdate();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelCommit = true;
      cancelTool = true;
      cancelSkill = true;
      unsubTrail();
      unsubC4();
      unsubTrace();
      trailStore.dispose();
      c4Store.dispose();
      traceStore.dispose();
      chatBridgeStore?.dispose();
      innerHandle.destroy();
    },
  };
}
