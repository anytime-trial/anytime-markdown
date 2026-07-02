/**
 * vanilla 版 ChatBridge（`useChatBridge.ts` の React hook を素 DOM ストア化したもの）。
 *
 * 脱React 移行で MemoryPanel が useChatBridge を直接生成していた経路が失われ、vanilla の
 * mountTrailViewerApp からは常に makeNoopBridge にフォールバックしていた（Chat タブが常時
 * 「接続不可」になる回帰）。本ストアは WebSocket 接続・provider ステータス購読・chat チャンク
 * 配信を hook と同一ロジックで担い、status/detail が変わるたび onStatusChange を呼んで
 * トップの再描画（buildViewerProps → 新しいスナップショット）を促す。
 */
import type { ChatBridge, ChatBridgeStatus } from './useChatBridge';

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

export interface ChatBridgeStore {
  /** 現在の status/detail を反映した ChatBridge スナップショットを返す（関数群は安定参照）。 */
  getSnapshot(): ChatBridge;
  /** WS 切断・タイマー解除・ハンドラ解放。 */
  dispose(): void;
}

/**
 * vanilla ChatBridge ストアを生成する。
 *
 * @param serverUrl Trail サーバー URL（ws/wss へ変換して接続）。
 * @param onStatusChange status/detail 変化時に呼ばれる（呼び出し側で再描画をトリガする）。
 */
export function createChatBridge(serverUrl: string, onStatusChange: () => void): ChatBridgeStore {
  let status: ChatBridgeStatus['status'] = 'unknown';
  let detail: string | undefined;
  let ws: WebSocket | null = null;
  const handlers = new Set<(chunk: unknown) => void>();
  let retryCount = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const wsUrl = buildWsUrl(serverUrl);

  function connect(): void {
    if (disposed || !wsUrl) return;
    const socket = new WebSocket(wsUrl);
    ws = socket;

    socket.addEventListener('open', () => {
      retryCount = 0;
    });

    socket.addEventListener('message', (event: MessageEvent) => {
      let parsed: { type?: unknown; status?: unknown; detail?: unknown; chunk?: unknown };
      try {
        parsed = JSON.parse(String(event.data));
      } catch (err) {
        console.error('[createChatBridge] failed to parse WS message', err);
        return;
      }
      if (parsed.type === 'provider.status') {
        const next = typeof parsed.status === 'string' ? parsed.status : 'unknown';
        status = next === 'ready' || next === 'unavailable' ? next : 'unknown';
        detail = typeof parsed.detail === 'string' ? parsed.detail : undefined;
        onStatusChange();
      } else if (parsed.type === 'chat.chunk') {
        for (const h of handlers) h(parsed.chunk);
      }
    });

    socket.addEventListener('close', () => {
      if (ws === socket) ws = null;
      scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      try {
        socket.close();
      } catch (err) {
        // closing an already-closed socket can throw — ignore
        console.error('[createChatBridge] error closing socket', err);
      }
    });
  }

  function scheduleReconnect(): void {
    if (disposed || retryCount >= MAX_RETRIES) return;
    retryCount += 1;
    retryTimer = setTimeout(connect, RECONNECT_DELAY_MS);
  }

  function sendPayload(payload: unknown): void {
    if (!ws) return;
    try {
      ws.send(JSON.stringify(payload));
    } catch (err) {
      // WS not yet open or already closed — drop; user can retry
      console.error('[createChatBridge] send failed', err);
    }
  }

  const subscribe = (h: (chunk: unknown) => void): (() => void) => {
    handlers.add(h);
    return () => { handlers.delete(h); };
  };
  const send = (query: string): void => sendPayload({ type: 'chat.send', query });
  const abort = (): void => sendPayload({ type: 'chat.abort' });
  const recheck = (): void => sendPayload({ type: 'provider.recheck' });

  if (wsUrl) connect();

  return {
    getSnapshot(): ChatBridge {
      return { status, detail, subscribe, send, abort, recheck };
    },
    dispose(): void {
      disposed = true;
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (ws) {
        try {
          ws.close();
        } catch (err) {
          console.error('[createChatBridge] error closing socket on dispose', err);
        }
        ws = null;
      }
      handlers.clear();
    },
  };
}
