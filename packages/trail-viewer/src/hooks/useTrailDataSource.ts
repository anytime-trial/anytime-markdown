import { useCallback, useEffect, useRef, useState } from 'react';

import type { TrailFilter, TrailMessage, TrailSession } from '../parser/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrailDataSourceResult {
  readonly sessions: readonly TrailSession[];
  readonly messages: readonly TrailMessage[];
  readonly connected: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  readonly loadSession: (id: string) => void;
  readonly searchSessions: (filter: TrailFilter) => void;
}

interface WsMessage {
  readonly type: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildQueryString(filter: TrailFilter): string {
  const params = new URLSearchParams();
  if (filter.gitBranch) params.set('branch', filter.gitBranch);
  if (filter.model) params.set('model', filter.model);
  if (filter.searchText) params.set('q', filter.searchText);
  if (filter.dateRange) {
    params.set('from', filter.dateRange.from);
    params.set('to', filter.dateRange.to);
  }
  if (filter.project) params.set('project', filter.project);
  if (filter.toolName) params.set('toolName', filter.toolName);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function isWsMessage(v: unknown): v is WsMessage {
  if (typeof v !== 'object' || v === null) return false;
  return typeof (v as Record<string, unknown>).type === 'string';
}

const RECONNECT_DELAY_MS = 3_000;
const MAX_RETRIES = 5;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTrailDataSource(serverUrl?: string): TrailDataSourceResult {
  const isRemote = serverUrl !== undefined;

  // State
  const [sessions, setSessions] = useState<readonly TrailSession[]>([]);
  const [messages, setMessages] = useState<readonly TrailMessage[]>([]);
  const [connected, setConnected] = useState(!isRemote);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Base URL for API calls
  const baseUrl = isRemote ? serverUrl : '';

  // --- Fetch sessions ---

  const fetchSessions = useCallback(
    async (queryString = ''): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${baseUrl}/api/trail/sessions${queryString}`);
        if (!res.ok) {
          setError(`Failed to fetch sessions: ${res.status}`);
          return;
        }
        const data: unknown = await res.json();
        if (Array.isArray(data)) {
          setSessions(data as readonly TrailSession[]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch sessions');
      } finally {
        setLoading(false);
      }
    },
    [baseUrl],
  );

  // --- Load single session messages ---

  const loadSession = useCallback(
    (id: string): void => {
      setLoading(true);
      setError(null);

      fetch(`${baseUrl}/api/trail/sessions/${encodeURIComponent(id)}`)
        .then(async (res) => {
          if (!res.ok) {
            setError(`Failed to load session: ${res.status}`);
            return;
          }
          const data: unknown = await res.json();
          if (Array.isArray(data)) {
            setMessages(data as readonly TrailMessage[]);
          }
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'Failed to load session');
        })
        .finally(() => {
          setLoading(false);
        });
    },
    [baseUrl],
  );

  // --- Search sessions ---

  const searchSessions = useCallback(
    (filter: TrailFilter): void => {
      void fetchSessions(buildQueryString(filter));
    },
    [fetchSessions],
  );

  // --- Initial fetch ---

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  // --- WebSocket (remote mode only) ---

  useEffect(() => {
    if (!isRemote || !serverUrl) return;

    function connect(): void {
      const host = new URL(serverUrl as string).host;
      const ws = new WebSocket(`ws://${host}/ws`);
      wsRef.current = ws;

      ws.addEventListener('open', () => {
        setConnected(true);
        retryCountRef.current = 0;
      });

      ws.addEventListener('message', (event: MessageEvent) => {
        try {
          const parsed: unknown = JSON.parse(String(event.data));
          if (isWsMessage(parsed) && parsed.type === 'sessions-updated') {
            void fetchSessions();
          }
        } catch {
          // Malformed message — ignore
        }
      });

      ws.addEventListener('close', () => {
        setConnected(false);
        scheduleReconnect();
      });

      ws.addEventListener('error', () => {
        setConnected(false);
        ws.close();
      });
    }

    function scheduleReconnect(): void {
      if (retryCountRef.current >= MAX_RETRIES) return;
      retryCountRef.current += 1;
      retryTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
    }

    connect();

    return () => {
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverUrl]);

  return {
    sessions,
    messages,
    connected,
    loading,
    error,
    loadSession,
    searchSessions,
  };
}
