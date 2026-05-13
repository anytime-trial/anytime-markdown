import { useCallback, useEffect, useRef, useState } from 'react';

export interface ChatBridgeStatus {
  readonly status: 'ready' | 'unavailable' | 'unknown';
  readonly detail?: string;
}

export interface ChatBridge extends ChatBridgeStatus {
  subscribe(handler: (chunk: unknown) => void): () => void;
  send(query: string): void;
  abort(): void;
  recheck(): void;
}

const RECONNECT_DELAY_MS = 3_000;
const MAX_RETRIES = 5;

function buildWsUrl(serverUrl: string): string | null {
  if (!serverUrl) return null;
  try {
    const url = new URL(serverUrl);
    const proto = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${url.host}`;
  } catch {
    return null;
  }
}

export function useChatBridge(serverUrl: string): ChatBridge {
  const [status, setStatus] = useState<ChatBridgeStatus['status']>('unknown');
  const [detail, setDetail] = useState<string | undefined>();

  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Set<(chunk: unknown) => void>>(new Set());
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const wsUrl = buildWsUrl(serverUrl);
    if (!wsUrl) return;

    function connect(): void {
      const ws = new WebSocket(wsUrl as string);
      wsRef.current = ws;

      ws.addEventListener('open', () => {
        retryCountRef.current = 0;
      });

      ws.addEventListener('message', (event: MessageEvent) => {
        let parsed: { type?: unknown; status?: unknown; detail?: unknown; chunk?: unknown };
        try {
          parsed = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (parsed.type === 'provider.status') {
          const next = typeof parsed.status === 'string' ? parsed.status : 'unknown';
          setStatus(
            next === 'ready' || next === 'unavailable' ? next : 'unknown',
          );
          setDetail(typeof parsed.detail === 'string' ? parsed.detail : undefined);
        } else if (parsed.type === 'chat.chunk') {
          for (const h of handlersRef.current) h(parsed.chunk);
        }
      });

      ws.addEventListener('close', () => {
        if (wsRef.current === ws) wsRef.current = null;
        scheduleReconnect();
      });

      ws.addEventListener('error', () => {
        try {
          ws.close();
        } catch {
          // closing an already-closed socket can throw — ignore
        }
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
        try {
          wsRef.current.close();
        } catch {
          // ignore close errors on cleanup
        }
        wsRef.current = null;
      }
    };
  }, [serverUrl]);

  const subscribe = useCallback((h: (chunk: unknown) => void) => {
    handlersRef.current.add(h);
    return () => {
      handlersRef.current.delete(h);
    };
  }, []);

  const sendPayload = useCallback((payload: unknown): void => {
    const ws = wsRef.current;
    if (!ws) return;
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // WS not yet open or already closed — drop silently; user can retry
    }
  }, []);

  const send = useCallback(
    (query: string) => sendPayload({ type: 'chat.send', query }),
    [sendPayload],
  );
  const abort = useCallback(
    () => sendPayload({ type: 'chat.abort' }),
    [sendPayload],
  );
  const recheck = useCallback(
    () => sendPayload({ type: 'provider.recheck' }),
    [sendPayload],
  );

  return { status, detail, subscribe, send, abort, recheck };
}
