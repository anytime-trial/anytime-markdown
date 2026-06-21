/**
 * logs タブの vanilla mount（React シェル撤去フェーズ S5 完成形）。
 *
 * useLogsDataSource の全ロジックをインライン化し、VanillaIsland ブリッジなしで
 * mountLogsView を直接駆動する。
 *
 * props:
 *   baseUrl            - daemon base URL (e.g. `http://127.0.0.1:7531`)
 *   subscribe          - WS subscribe handler
 *   onOpenOutputChannel - optional VS Code OutputChannel focus callback
 *   t                  - i18n string resolver
 */
import type { LogEntry } from '../../c4/hooks/c4WsMessages';
import {
  appendLogsToRing,
  applyClientFilter,
  type LogFilter,
  type WsSubscribe,
} from '../../hooks/useLogsDataSource';
import type { VanillaViewHandle } from '../../shared/vanillaIsland';
import { mountLogsView, type LogsViewProps } from './logsView';

// ---------------------------------------------------------------------------
// Constants (mirrored from useLogsDataSource)
// ---------------------------------------------------------------------------
const RING_MAX = 1000;
const INITIAL_FETCH_LIMIT = 200;
const HISTORY_PAGE_LIMIT = 500;

const DEFAULT_FILTER: LogFilter = {
  level: ['debug', 'info', 'warn', 'error'],
  source: ['extension', 'daemon'],
  q: '',
};

// ---------------------------------------------------------------------------
// buildQuery helper (mirrored from useLogsDataSource – kept local to avoid
// exporting an internal from the hook module)
// ---------------------------------------------------------------------------
function buildQuery(filter: LogFilter, extra?: Record<string, string>): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.level.length > 0) params.set('level', filter.level.join(','));
  if (filter.source.length > 0) params.set('source', filter.source.join(','));
  if (filter.q) params.set('q', filter.q);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) params.set(k, v);
  }
  return params;
}

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

export interface LogsTabProps {
  /** Daemon base URL, e.g. `http://127.0.0.1:7531` */
  baseUrl: string;
  /** Subscribe handler that forwards `log-batch` WS frames. */
  subscribe: WsSubscribe;
  /** Optional callback to focus the VS Code OutputChannel. */
  onOpenOutputChannel?: () => void;
  /** i18n string resolver. */
  t: (key: string) => string;
  /** Optional fetch override (for testing). */
  fetcher?: typeof fetch;
}

// ---------------------------------------------------------------------------
// mount
// ---------------------------------------------------------------------------

export function mountLogsTab(
  container: HTMLElement,
  initial: LogsTabProps,
): VanillaViewHandle<LogsTabProps> {
  // ---- mutable state -------------------------------------------------------
  let props = initial;
  let destroyed = false;

  let mode: 'live' | 'history' = 'live';
  let filter: LogFilter = DEFAULT_FILTER;
  let autoScroll = true;

  // ring buffer & pending queue (live mode)
  let ring: LogEntry[] = [];
  let pending: LogEntry[] = [];
  let paused = false;
  let pendingCount = 0;
  let nextCursor: string | null = null;

  // active fetch controllers
  let liveInitController: AbortController | null = null;
  let historyController: AbortController | null = null;

  // WS unsubscribe handle
  let unsubscribe: (() => void) | null = null;

  // ---- inner view ----------------------------------------------------------
  const view = mountLogsView(container, buildViewProps());

  // ---- helpers -------------------------------------------------------------

  function safeSetState(fn: () => void): void {
    if (!destroyed) fn();
  }

  function buildViewProps(): LogsViewProps {
    return {
      t: props.t,
      mode,
      filter,
      autoScroll,
      logs: applyClientFilter(mode === 'live' ? ring : /* raw logs kept separately */ rawHistoryLogs, filter),
      paused,
      pendingCount,
      nextCursor,
      onModeChange: handleModeChange,
      onFilterChange: handleFilterChange,
      onAutoScrollChange: (v) => { autoScroll = v; rerender(); },
      onPause: handlePause,
      onResume: handleResume,
      onClear: handleClear,
      onLoadMore: () => { void handleLoadMore(); },
      onOpenOutputChannel: props.onOpenOutputChannel,
    };
  }

  function rerender(): void {
    if (!destroyed) view.update(buildViewProps());
  }

  // ---- raw history store (history mode keeps full unfiltered list) ---------
  // In live mode we reuse `ring`; in history mode we store raw from REST.
  let rawHistoryLogs: LogEntry[] = [];

  // Override buildViewProps to dispatch correctly:
  // (the closure above references rawHistoryLogs at call time — OK)

  // ---- live mode -----------------------------------------------------------

  function startLiveSubscription(): void {
    unsubscribe?.();
    unsubscribe = props.subscribe((msg) => {
      if (destroyed) return;
      const incoming = [...msg.logs];
      if (paused) {
        pending = [...pending, ...incoming];
        pendingCount = pending.length;
        safeSetState(() => rerender());
        return;
      }
      ring = appendLogsToRing(ring, incoming, RING_MAX);
      safeSetState(() => rerender());
    });
  }

  function stopLiveSubscription(): void {
    unsubscribe?.();
    unsubscribe = null;
  }

  function startLiveInitialFetch(): void {
    liveInitController?.abort();
    liveInitController = new AbortController();
    const { signal } = liveInitController;
    const f = props.fetcher ?? fetch;
    const url = `${props.baseUrl}/api/logs?limit=${INITIAL_FETCH_LIMIT}`;
    void f(url, { signal })
      .then(async (res) => {
        if (!res.ok || signal.aborted || destroyed) return;
        const body = (await res.json()) as { logs: LogEntry[]; nextCursor: string | null };
        if (signal.aborted || destroyed) return;
        ring = body.logs.slice().reverse();
        safeSetState(() => rerender());
      })
      .catch((err: unknown) => {
        if (signal.aborted || destroyed) return;
        console.error('[logsTab] live initial fetch failed', err);
      });
  }

  function abortLiveInitialFetch(): void {
    liveInitController?.abort();
    liveInitController = null;
  }

  // ---- history mode --------------------------------------------------------

  function startHistoryFetch(): void {
    historyController?.abort();
    historyController = new AbortController();
    const { signal } = historyController;
    const f = props.fetcher ?? fetch;
    const params = buildQuery(filter, { limit: String(HISTORY_PAGE_LIMIT) });
    void f(`${props.baseUrl}/api/logs?${params.toString()}`, { signal })
      .then(async (res) => {
        if (!res.ok || signal.aborted || destroyed) return;
        const body = (await res.json()) as { logs: LogEntry[]; nextCursor: string | null };
        if (signal.aborted || destroyed) return;
        rawHistoryLogs = body.logs;
        nextCursor = body.nextCursor;
        safeSetState(() => rerender());
      })
      .catch((err: unknown) => {
        if (signal.aborted || destroyed) return;
        console.error('[logsTab] history fetch failed', err);
      });
  }

  function abortHistoryFetch(): void {
    historyController?.abort();
    historyController = null;
  }

  // ---- mode lifecycle ------------------------------------------------------

  function activateLive(): void {
    rawHistoryLogs = [];
    abortHistoryFetch();
    startLiveSubscription();
    startLiveInitialFetch();
  }

  function activateHistory(): void {
    stopLiveSubscription();
    abortLiveInitialFetch();
    ring = [];
    pending = [];
    paused = false;
    pendingCount = 0;
    startHistoryFetch();
  }

  // ---- event handlers ------------------------------------------------------

  function handleModeChange(m: 'live' | 'history'): void {
    if (m === mode) return;
    mode = m;
    nextCursor = null;
    if (m === 'live') {
      activateLive();
    } else {
      activateHistory();
    }
    rerender();
  }

  function handleFilterChange(f: LogFilter): void {
    filter = f;
    if (mode === 'history') {
      nextCursor = null;
      startHistoryFetch();
    }
    rerender();
  }

  function handlePause(): void {
    paused = true;
    rerender();
  }

  function handleResume(): void {
    if (pending.length > 0) {
      ring = appendLogsToRing(ring, pending, RING_MAX);
      pending = [];
      pendingCount = 0;
    }
    paused = false;
    rerender();
  }

  function handleClear(): void {
    ring = [];
    pending = [];
    pendingCount = 0;
    rawHistoryLogs = [];
    rerender();
  }

  async function handleLoadMore(): Promise<void> {
    if (!nextCursor) return;
    const f = props.fetcher ?? fetch;
    const params = buildQuery(filter, {
      limit: String(HISTORY_PAGE_LIMIT),
      cursor: nextCursor,
    });
    try {
      const res = await f(`${props.baseUrl}/api/logs?${params.toString()}`);
      if (!res.ok || destroyed) return;
      const body = (await res.json()) as { logs: LogEntry[]; nextCursor: string | null };
      if (destroyed) return;
      rawHistoryLogs = [...rawHistoryLogs, ...body.logs];
      nextCursor = body.nextCursor;
      rerender();
    } catch (err: unknown) {
      if (!destroyed) console.error('[logsTab] loadMore failed', err);
    }
  }

  // ---- initial activation --------------------------------------------------
  activateLive();
  rerender();

  // ---- public handle -------------------------------------------------------
  return {
    update(next: LogsTabProps): void {
      const prevBaseUrl = props.baseUrl;
      const prevSubscribe = props.subscribe;
      props = next;

      // Re-fetch / re-subscribe when connection props change
      if (next.baseUrl !== prevBaseUrl || next.subscribe !== prevSubscribe) {
        if (mode === 'live') {
          activateLive();
        } else {
          activateHistory();
        }
      }
      rerender();
    },
    destroy(): void {
      destroyed = true;
      stopLiveSubscription();
      abortLiveInitialFetch();
      abortHistoryFetch();
      view.destroy();
    },
  };
}
