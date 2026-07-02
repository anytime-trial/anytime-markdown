/**
 * MemoryPanel の vanilla DOM 版。
 *
 * サブタブ状態・hash routing・MemoryReader・dbExists probe・driftRows・
 * pendingBugFilter / pendingReviewFilter を所有し、対応する vanilla サブビューを
 * 直接マウントする（React の `.tsx` ラッパは経由しない）。
 *
 * 呼び出し側（components/MemoryPanel.tsx）は thin React wrapper として
 * useTrailTheme / useTrailI18n / useChatBridge を解決し、
 * tokens / isDark / t / bridge を props に含めてこのビューに渡す。
 */
import { createTabs } from '@anytime-markdown/ui-core';
import type { TrailThemeTokens } from '../../theme/designTokens';
import type { VanillaViewHandle } from '../../shared/vanillaIsland';
import { MEMORY_TAB_DEFS, type MemoryTabValue } from '../../components/memoryTabs';
import { MemoryReader } from '../../data/readers/MemoryReader';
import type { MemoryDriftEventRow } from '../../data/types';
import type { ChatBridge } from '../../hooks/useChatBridge';
import { mountDriftPanel } from './driftPanel';
import { mountBugHistoryPanel } from './bugHistoryPanel';
import { mountReviewPanel } from './reviewPanel';
import { mountPipelineRunsPanel } from './pipelineRunsPanel';
import { mountChatPanel } from './chatPanel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MemoryPanelViewProps {
  readonly serverUrl: string;
  readonly tokens: TrailThemeTokens;
  readonly isDark: boolean;
  readonly t: (key: string) => string;
  readonly bridge: ChatBridge;
  readonly onOpenSessionMessages?: (sessionId: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseHashSubTab(hash: string): MemoryTabValue | null {
  const match = /^#memory\/(drift|bug|review|runs|chat)/.exec(hash);
  if (!match) return null;
  return match[1] as MemoryTabValue;
}

type SubHandle = VanillaViewHandle<unknown> | null;

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

export function mountMemoryPanel(
  container: HTMLElement,
  initial: MemoryPanelViewProps,
): VanillaViewHandle<MemoryPanelViewProps> {
  let props = initial;
  let destroyed = false;

  // --- State -----------------------------------------------------------------
  let activeTab: MemoryTabValue =
    parseHashSubTab(globalThis.location?.hash ?? '') ?? 'drift';
  let dbExists: boolean | null = null;
  let driftRows: readonly MemoryDriftEventRow[] = [];
  let pendingBugFilter: { bugEntityIds: readonly string[] } | null = null;
  let pendingReviewFilter: { findingEntityIds: readonly string[] } | null = null;

  const reader = new MemoryReader(props.serverUrl);
  let currentServerUrl = props.serverUrl;

  // --- Root layout -----------------------------------------------------------
  const root = document.createElement('div');
  root.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;';
  container.appendChild(root);

  // --- Loading / noDb placeholders ------------------------------------------
  const loadingEl = document.createElement('div');
  loadingEl.style.cssText =
    'flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;';

  const spinner = document.createElement('div');
  spinner.setAttribute('role', 'progressbar');
  spinner.style.cssText =
    'width:24px;height:24px;border:3px solid var(--am-color-divider);' +
    'border-top-color:var(--am-color-primary-main);border-radius:50%;' +
    'animation:am-spin 0.8s linear infinite;';
  // inject spin keyframes once
  if (!document.getElementById('am-spin-keyframes')) {
    const style = document.createElement('style');
    style.id = 'am-spin-keyframes';
    style.textContent = '@keyframes am-spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(style);
  }

  const loadingText = document.createElement('span');
  loadingText.style.cssText =
    'font-size:0.875rem;color:var(--am-color-text-secondary);';
  loadingText.textContent = props.t('memory.loading');
  loadingEl.append(spinner, loadingText);

  const noDbEl = document.createElement('div');
  noDbEl.style.cssText =
    'flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;';

  const noDbTitle = document.createElement('span');
  noDbTitle.style.cssText = 'font-size:1rem;color:var(--am-color-text-primary);';
  noDbTitle.textContent = props.t('memory.noDb');

  const noDbDesc = document.createElement('span');
  noDbDesc.style.cssText = 'font-size:0.875rem;color:var(--am-color-text-secondary);';
  noDbDesc.textContent = props.t('memory.noDb.description');
  noDbEl.append(noDbTitle, noDbDesc);

  // --- Tab bar ---------------------------------------------------------------
  const tabBarWrap = document.createElement('div');
  tabBarWrap.style.cssText =
    'border-bottom:1px solid var(--am-color-divider);flex-shrink:0;';

  const tabs = createTabs({
    value: activeTab,
    tabs: MEMORY_TAB_DEFS.map((d) => ({
      value: d.value,
      label: props.t(d.i18nKey),
      id: d.id,
      ariaControls: d.panelId,
    })),
    ariaLabel: 'memory sub-tabs',
    onChange: (v) => {
      switchTab(v as MemoryTabValue);
    },
  });
  tabBarWrap.appendChild(tabs.el);

  // --- Panel host ------------------------------------------------------------
  const panelHost = document.createElement('div');
  panelHost.style.cssText = 'flex:1;overflow:hidden;display:flex;flex-direction:column;';

  // --- Sub-view handles ------------------------------------------------------
  // 旧 MemoryPanel.tsx は 5 サブパネルを常時マウントし CSS display のみで切替えて
  // 下位のローカル UI 状態（Chat 入力・展開行・スクロール位置）を保持していた。
  // vanilla でも初回訪問で mount したパネルは保持し、切替は display で行う（毎回破棄しない）。
  const subHosts = new Map<MemoryTabValue, HTMLElement>();
  const subHandles = new Map<MemoryTabValue, SubHandle>();
  let mountedTab: MemoryTabValue | null = null;

  function buildSubForTab(tab: MemoryTabValue, host: HTMLElement): SubHandle {
    const tStr = props.t;
    if (tab === 'drift') {
      return mountDriftPanel(host, {
        t: tStr,
        rows: driftRows,
        onResolve: handleResolve,
        onLoadDetail: (id) => reader.getDriftEventDetail(id),
      }) as SubHandle;
    }
    if (tab === 'bug') {
      return mountBugHistoryPanel(host, {
        t: tStr,
        reader,
        onOpenSessionMessages: props.onOpenSessionMessages,
        onOpenPrecedingReviews: handleOpenPrecedingReviews,
        onOpenSiblingBugs: handleOpenPrecedingBugs,
        pendingBugFilter,
      }) as SubHandle;
    }
    if (tab === 'review') {
      return mountReviewPanel(host, {
        t: tStr,
        reader,
        onOpenSessionMessages: props.onOpenSessionMessages,
        onOpenPrecedingBugs: handleOpenPrecedingBugs,
        pendingReviewFilter,
      }) as SubHandle;
    }
    if (tab === 'runs') {
      return mountPipelineRunsPanel(host, {
        t: tStr,
        reader,
        isDark: props.isDark,
      }) as SubHandle;
    }
    // chat
    return mountChatPanel(host, {
      t: tStr,
      bridge: props.bridge,
    }) as SubHandle;
  }

  function updateSubForTab(tab: MemoryTabValue): void {
    const handle = subHandles.get(tab);
    if (!handle) return;
    const tStr = props.t;
    if (tab === 'drift') {
      (handle as VanillaViewHandle<Parameters<typeof mountDriftPanel>[1]>).update({
        t: tStr,
        rows: driftRows,
        onResolve: handleResolve,
        onLoadDetail: (id) => reader.getDriftEventDetail(id),
      });
    } else if (tab === 'bug') {
      (handle as VanillaViewHandle<Parameters<typeof mountBugHistoryPanel>[1]>).update({
        t: tStr,
        reader,
        onOpenSessionMessages: props.onOpenSessionMessages,
        onOpenPrecedingReviews: handleOpenPrecedingReviews,
        onOpenSiblingBugs: handleOpenPrecedingBugs,
        pendingBugFilter,
      });
    } else if (tab === 'review') {
      (handle as VanillaViewHandle<Parameters<typeof mountReviewPanel>[1]>).update({
        t: tStr,
        reader,
        onOpenSessionMessages: props.onOpenSessionMessages,
        onOpenPrecedingBugs: handleOpenPrecedingBugs,
        pendingReviewFilter,
      });
    } else if (tab === 'runs') {
      (handle as VanillaViewHandle<Parameters<typeof mountPipelineRunsPanel>[1]>).update({
        t: tStr,
        reader,
        isDark: props.isDark,
      });
    } else {
      (handle as VanillaViewHandle<Parameters<typeof mountChatPanel>[1]>).update({
        t: tStr,
        bridge: props.bridge,
      });
    }
  }

  function destroySub(): void {
    for (const handle of subHandles.values()) {
      if (handle) (handle as VanillaViewHandle<unknown>).destroy();
    }
    subHandles.clear();
    subHosts.clear();
    mountedTab = null;
    panelHost.replaceChildren();
  }

  /** 初回はマウント、以降は display 切替で表示する（状態保持）。 */
  function mountSubForTab(tab: MemoryTabValue): void {
    let host = subHosts.get(tab);
    const fresh = !host;
    if (!host) {
      host = document.createElement('div');
      host.style.cssText = 'flex:1;overflow:hidden;flex-direction:column;';
      host.setAttribute('data-memory-tab-host', tab);
      panelHost.appendChild(host);
      subHosts.set(tab, host);
      subHandles.set(tab, buildSubForTab(tab, host));
    }
    for (const [k, h] of subHosts) {
      h.style.display = k === tab ? 'flex' : 'none';
    }
    mountedTab = tab;
    // 既マウントのタブへ切替える場合は最新 props / pending filter（cross-tab 遷移）を反映する。
    // 新規マウント時は build 時点で反映済みのため不要。
    if (!fresh) updateSubForTab(tab);
  }

  function updateSub(): void {
    // マウント済みの全サブパネルを最新 props で更新する（旧: 全マウントで全 re-render）。
    for (const tab of subHandles.keys()) updateSubForTab(tab);
  }

  // --- Tab switch ------------------------------------------------------------
  function switchTab(tab: MemoryTabValue, updateHash = true): void {
    activeTab = tab;
    pendingBugFilter = null;
    pendingReviewFilter = null;

    tabs.update({ value: tab });

    if (updateHash && typeof globalThis.history !== 'undefined') {
      globalThis.history.replaceState(null, '', `#memory/${tab}`);
    }

    if (dbExists === true) {
      mountSubForTab(tab);
    }
  }

  // --- Cross-tab filter callbacks --------------------------------------------
  function handleOpenPrecedingBugs(bugEntityIds: readonly string[]): void {
    pendingBugFilter = { bugEntityIds };
    pendingReviewFilter = null;
    activeTab = 'bug';
    tabs.update({ value: 'bug' });
    if (typeof globalThis.history !== 'undefined') {
      globalThis.history.replaceState(null, '', '#memory/bug');
    }
    if (dbExists === true) {
      mountSubForTab('bug');
    }
  }

  function handleOpenPrecedingReviews(findingEntityIds: readonly string[]): void {
    pendingReviewFilter = { findingEntityIds };
    pendingBugFilter = null;
    activeTab = 'review';
    tabs.update({ value: 'review' });
    if (typeof globalThis.history !== 'undefined') {
      globalThis.history.replaceState(null, '', '#memory/review');
    }
    if (dbExists === true) {
      mountSubForTab('review');
    }
  }

  // --- Resolve drift event ---------------------------------------------------
  async function handleResolve(id: string, note: string): Promise<void> {
    await reader.resolveDriftEvent(id, note);
    const updated = await reader.listDriftEvents({ unresolvedOnly: false, limit: 200 });
    if (destroyed) return;
    driftRows = updated;
    if (mountedTab === 'drift') {
      updateSub();
    }
  }

  // --- Root render -----------------------------------------------------------
  function render(): void {
    root.replaceChildren();

    if (dbExists === null) {
      // still probing
      loadingText.textContent = props.t('memory.loading');
      root.appendChild(loadingEl);
      return;
    }

    if (dbExists === false) {
      noDbTitle.textContent = props.t('memory.noDb');
      noDbDesc.textContent = props.t('memory.noDb.description');
      root.appendChild(noDbEl);
      return;
    }

    // dbExists === true
    root.append(tabBarWrap, panelHost);
    mountSubForTab(activeTab);
  }

  // --- Probe on mount --------------------------------------------------------
  void reader.probe().then((exists) => {
    if (destroyed) return;
    dbExists = exists;

    if (exists) {
      // Load drift rows immediately
      void reader.listDriftEvents({ unresolvedOnly: false, limit: 200 }).then((rows) => {
        if (destroyed) return;
        driftRows = rows;
        // If drift tab is already visible, update it
        if (mountedTab === 'drift') {
          updateSub();
        }
      });
    }

    render();
  });

  // initial render (shows loading spinner)
  render();

  // --- Public handle ---------------------------------------------------------
  return {
    update(next) {
      const urlChanged = next.serverUrl !== currentServerUrl;
      props = next;

      // Update tab labels in case t() changed
      tabs.update({
        tabs: MEMORY_TAB_DEFS.map((d) => ({
          value: d.value,
          label: props.t(d.i18nKey),
          id: d.id,
          ariaControls: d.panelId,
        })),
        value: activeTab,
      });

      if (urlChanged) {
        // serverUrl changed: re-probe with new reader is not worth the complexity;
        // the React wrapper recreates the whole island if serverUrl changes.
        // For now reflect only t/isDark/bridge changes to the active sub-view.
        currentServerUrl = next.serverUrl;
      }

      // Update placeholder texts if visible
      loadingText.textContent = props.t('memory.loading');
      noDbTitle.textContent = props.t('memory.noDb');
      noDbDesc.textContent = props.t('memory.noDb.description');

      // Propagate to current sub-view
      updateSub();
    },
    destroy() {
      destroyed = true;
      destroySub();
      tabs.destroy();
      root.remove();
    },
  };
}
