/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useChatBridge } from '../useChatBridge';

interface FakeWebSocket {
  url: string;
  listeners: Map<string, Array<(event: { data: string | Buffer }) => void>>;
  sent: string[];
  close: () => void;
}

const createdSockets: FakeWebSocket[] = [];

function installFakeWebSocket(): void {
  const FakeWS = class {
    url: string;
    listeners = new Map<string, Array<(event: { data: string | Buffer }) => void>>();
    sent: string[] = [];
    constructor(url: string) {
      this.url = url;
      createdSockets.push(this as unknown as FakeWebSocket);
    }
    addEventListener(type: string, fn: (event: { data: string | Buffer }) => void): void {
      const arr = this.listeners.get(type) ?? [];
      arr.push(fn);
      this.listeners.set(type, arr);
    }
    removeEventListener(): void {
      // not used in tests
    }
    send(payload: string): void {
      this.sent.push(payload);
    }
    close(): void {
      // captured for cleanup assertion
    }
  };
  (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket =
    FakeWS as unknown as typeof WebSocket;
}

function emitMessage(socket: FakeWebSocket, payload: unknown): void {
  for (const fn of socket.listeners.get('message') ?? []) {
    fn({ data: JSON.stringify(payload) });
  }
}

describe('useChatBridge (WS bridge)', () => {
  beforeEach(() => {
    createdSockets.length = 0;
    installFakeWebSocket();
  });

  it('mount 時に serverUrl の host で WebSocket を 1 本張る', () => {
    renderHook(() => useChatBridge('http://localhost:19841'));
    expect(createdSockets.length).toBe(1);
    expect(createdSockets[0].url).toBe('ws://localhost:19841');
  });

  it('serverUrl が https の場合は wss にプロトコル昇格する', () => {
    renderHook(() => useChatBridge('https://example.com:19841'));
    expect(createdSockets[0].url).toBe('wss://example.com:19841');
  });

  it('serverUrl が空文字なら WebSocket を張らない (no-op)', () => {
    renderHook(() => useChatBridge(''));
    expect(createdSockets.length).toBe(0);
  });

  it('provider.status を受けて status / detail を更新する', () => {
    const { result } = renderHook(() => useChatBridge('http://localhost:19841'));
    expect(result.current.status).toBe('unknown');

    act(() => {
      emitMessage(createdSockets[0], { type: 'provider.status', status: 'unavailable', detail: 'oops' });
    });
    expect(result.current.status).toBe('unavailable');
    expect(result.current.detail).toBe('oops');

    act(() => {
      emitMessage(createdSockets[0], { type: 'provider.status', status: 'ready' });
    });
    expect(result.current.status).toBe('ready');
  });

  it('chat.chunk を subscribe したハンドラに配信する', () => {
    const { result } = renderHook(() => useChatBridge('http://localhost:19841'));
    const received: unknown[] = [];
    act(() => {
      result.current.subscribe((chunk) => received.push(chunk));
    });

    act(() => {
      emitMessage(createdSockets[0], { type: 'chat.chunk', chunk: { type: 'token', payload: { delta: 'こん' } } });
      emitMessage(createdSockets[0], { type: 'chat.chunk', chunk: { type: 'token', payload: { delta: 'にちは' } } });
    });

    expect(received).toEqual([
      { type: 'token', payload: { delta: 'こん' } },
      { type: 'token', payload: { delta: 'にちは' } },
    ]);
  });

  it('subscribe の戻り関数を呼ぶと配信が止まる', () => {
    const { result } = renderHook(() => useChatBridge('http://localhost:19841'));
    const received: unknown[] = [];
    let unsub = (): void => {};
    act(() => {
      unsub = result.current.subscribe((chunk) => received.push(chunk));
    });

    act(() => unsub());

    act(() => {
      emitMessage(createdSockets[0], { type: 'chat.chunk', chunk: { type: 'token', payload: { delta: 'x' } } });
    });
    expect(received).toEqual([]);
  });

  it('send / abort / recheck は対応する WS メッセージを送信する', () => {
    const { result } = renderHook(() => useChatBridge('http://localhost:19841'));
    act(() => {
      result.current.send('hello');
      result.current.abort();
      result.current.recheck();
    });
    expect(createdSockets[0].sent).toEqual([
      JSON.stringify({ type: 'chat.send', query: 'hello' }),
      JSON.stringify({ type: 'chat.abort' }),
      JSON.stringify({ type: 'provider.recheck' }),
    ]);
  });

  it('不明な type のメッセージは無視する', () => {
    const { result } = renderHook(() => useChatBridge('http://localhost:19841'));
    act(() => {
      emitMessage(createdSockets[0], { type: 'noise', data: 1 });
    });
    expect(result.current.status).toBe('unknown');
  });

  it('壊れた JSON メッセージは無視する', () => {
    const { result } = renderHook(() => useChatBridge('http://localhost:19841'));
    act(() => {
      const sock = createdSockets[0];
      for (const fn of sock.listeners.get('message') ?? []) {
        fn({ data: '{not json' });
      }
    });
    expect(result.current.status).toBe('unknown');
  });
});
