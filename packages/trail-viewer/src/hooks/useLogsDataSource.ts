import { useCallback, useEffect, useRef, useState } from 'react';
import type { LogEntry, LogLevel, LogSource, WsLogBatchMessage } from '../c4/hooks/c4WsMessages';

const RING_MAX = 1000;
const INITIAL_FETCH_LIMIT = 200;
const HISTORY_PAGE_LIMIT = 500;

export interface LogFilter {
  readonly level: ReadonlyArray<LogLevel>;
  readonly source: ReadonlyArray<LogSource>;
  readonly q: string;
}

/** Append entries to a ring buffer, dropping oldest when over `max`. */
export function appendLogsToRing(
  ring: ReadonlyArray<LogEntry>,
  add: ReadonlyArray<LogEntry>,
  max: number = RING_MAX,
): LogEntry[] {
  const next = [...ring, ...add];
  if (next.length <= max) return next;
  return next.slice(next.length - max);
}

/** Apply client-side filters (level/source/q) to a ring of logs. */
export function applyClientFilter(
  logs: ReadonlyArray<LogEntry>,
  filter: LogFilter,
): LogEntry[] {
  const levelSet = new Set(filter.level);
  const sourceSet = new Set(filter.source);
  const q = filter.q.trim().toLowerCase();
  return logs.filter((l) => {
    if (!levelSet.has(l.level)) return false;
    if (!sourceSet.has(l.source)) return false;
    if (q && !l.message.toLowerCase().includes(q) && !l.component.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });
}

export type WsSubscribe = (handler: (msg: WsLogBatchMessage) => void) => () => void;

export interface UseLogsDataSourceOptions {
  readonly mode: 'live' | 'history';
  readonly filter: LogFilter;
  readonly baseUrl: string;
  readonly subscribe: WsSubscribe;
  readonly fetcher?: typeof fetch;
}

export interface LogsDataSource {
  readonly logs: ReadonlyArray<LogEntry>;
  readonly paused: boolean;
  readonly pendingCount: number;
  readonly nextCursor: string | null;
  pause(): void;
  resume(): void;
  clear(): void;
  loadMore(): Promise<void>;
}

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

export function useLogsDataSource(opts: UseLogsDataSourceOptions): LogsDataSource {
  const [logs, setLogs] = useState<ReadonlyArray<LogEntry>>([]);
  const [paused, setPaused] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const ringRef = useRef<LogEntry[]>([]);
  const pendingRef = useRef<LogEntry[]>([]);
  const pausedRef = useRef(false);

  // keep pausedRef in sync (subscribe handler closes over the ref)
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const flushPending = useCallback((): void => {
    if (pendingRef.current.length === 0) return;
    ringRef.current = appendLogsToRing(ringRef.current, pendingRef.current);
    pendingRef.current = [];
    setLogs(ringRef.current);
    setPendingCount(0);
  }, []);

  // Live mode: WebSocket subscription
  useEffect(() => {
    if (opts.mode !== 'live') return undefined;
    const handler = (msg: WsLogBatchMessage): void => {
      const incoming: LogEntry[] = [...msg.logs];
      if (pausedRef.current) {
        pendingRef.current = [...pendingRef.current, ...incoming];
        setPendingCount(pendingRef.current.length);
        return;
      }
      ringRef.current = appendLogsToRing(ringRef.current, incoming);
      setLogs(ringRef.current);
    };
    return opts.subscribe(handler);
  }, [opts.mode, opts.subscribe]);

  // Live mode: initial REST fetch (last 200 entries)
  useEffect(() => {
    if (opts.mode !== 'live') return;
    const f = opts.fetcher ?? fetch;
    // AbortController でアンマウント/依存変更時に in-flight fetch を中断し、
    // 解決後の setLogs (stale state 更新) を防ぐ。
    const controller = new AbortController();
    const url = `${opts.baseUrl}/api/logs?limit=${INITIAL_FETCH_LIMIT}`;
    void f(url, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as { logs: LogEntry[]; nextCursor: string | null };
        if (controller.signal.aborted) return;
        // API returns DESC order; reverse to chronological (oldest first) for the ring
        ringRef.current = body.logs.slice().reverse();
        setLogs(ringRef.current);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        // best-effort; WS が後続で埋めるため致命的ではないが、原因は残す
        console.error('[useLogsDataSource] live initial fetch failed', err);
      });
    return () => controller.abort();
  }, [opts.mode, opts.baseUrl, opts.fetcher]);

  // History mode: REST fetch on filter change
  useEffect(() => {
    if (opts.mode !== 'history') return;
    const f = opts.fetcher ?? fetch;
    const controller = new AbortController();
    const params = buildQuery(opts.filter, { limit: String(HISTORY_PAGE_LIMIT) });
    void f(`${opts.baseUrl}/api/logs?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as { logs: LogEntry[]; nextCursor: string | null };
        if (controller.signal.aborted) return;
        setLogs(body.logs);
        setNextCursor(body.nextCursor);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        // 履歴 fetch の失敗を握りつぶすと空一覧のまま原因不明になるためログを残す。
        console.error('[useLogsDataSource] history fetch failed', err);
      });
    return () => controller.abort();
  }, [opts.mode, opts.baseUrl, opts.fetcher, opts.filter]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (!nextCursor) return;
    const f = opts.fetcher ?? fetch;
    const params = buildQuery(opts.filter, {
      limit: String(HISTORY_PAGE_LIMIT),
      cursor: nextCursor,
    });
    const res = await f(`${opts.baseUrl}/api/logs?${params.toString()}`);
    if (!res.ok) return;
    const body = (await res.json()) as { logs: LogEntry[]; nextCursor: string | null };
    setLogs((prev) => [...prev, ...body.logs]);
    setNextCursor(body.nextCursor);
  }, [opts.baseUrl, opts.fetcher, opts.filter, nextCursor]);

  return {
    logs: applyClientFilter(logs, opts.filter),
    paused,
    pendingCount,
    nextCursor,
    pause: (): void => setPaused(true),
    resume: (): void => {
      setPaused(false);
      flushPending();
    },
    clear: (): void => {
      ringRef.current = [];
      pendingRef.current = [];
      setLogs([]);
      setPendingCount(0);
    },
    loadMore,
  };
}
