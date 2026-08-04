/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor } from '@testing-library/react';

import { useCodeGraph } from '../useCodeGraph';

interface FakeWebSocket {
  url: string;
  listeners: Map<string, Array<(event: { data: string | Buffer }) => void>>;
  close: () => void;
}

const createdSockets: FakeWebSocket[] = [];

function installFakeWebSocket(): void {
  const FakeWS = class {
    url: string;
    listeners = new Map<string, Array<(event: { data: string | Buffer }) => void>>();
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
    close(): void {
      // captured for cleanup assertion
    }
  };
  (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = FakeWS as unknown as typeof WebSocket;
}

function emitMessage(socket: FakeWebSocket, payload: unknown): void {
  for (const fn of socket.listeners.get('message') ?? []) {
    fn({ data: JSON.stringify(payload) });
  }
}

describe('useCodeGraph (WS subscribe)', () => {
  beforeEach(() => {
    createdSockets.length = 0;
    installFakeWebSocket();
    (globalThis as unknown as { fetch: typeof fetch }).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      async json() {
        return { nodes: [], edges: [], communities: {} };
      },
    } as unknown as Response));
  });

  it('mount 時に /api/code-graph を 1 回 fetch する', async () => {
    renderHook(() => useCodeGraph('http://localhost:19841'));
    await waitFor(() => {
      expect((globalThis.fetch as jest.Mock).mock.calls.length).toBe(1);
    });
    expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toContain('/api/code-graph');
  });

  it('WS code-graph-updated 受信時に再 fetch する', async () => {
    renderHook(() => useCodeGraph('http://localhost:19841'));
    await waitFor(() => {
      expect((globalThis.fetch as jest.Mock).mock.calls.length).toBe(1);
    });
    expect(createdSockets.length).toBeGreaterThanOrEqual(1);

    emitMessage(createdSockets[0], { type: 'code-graph-updated' });

    await waitFor(() => {
      expect((globalThis.fetch as jest.Mock).mock.calls.length).toBe(2);
    });
  });

  it('他 type の WS メッセージは無視する', async () => {
    renderHook(() => useCodeGraph('http://localhost:19841'));
    await waitFor(() => {
      expect((globalThis.fetch as jest.Mock).mock.calls.length).toBe(1);
    });
    emitMessage(createdSockets[0], { type: 'unrelated-event' });
    emitMessage(createdSockets[0], { type: 'model-updated' });
    // 100ms wait — no additional fetch should occur
    await new Promise((r) => setTimeout(r, 50));
    expect((globalThis.fetch as jest.Mock).mock.calls.length).toBe(1);
  });

  it('enabled: false のとき fetch も WS 接続もしない', async () => {
    renderHook(() => useCodeGraph('http://localhost:19841', { enabled: false }));
    await new Promise((r) => setTimeout(r, 50));
    expect((globalThis.fetch as jest.Mock).mock.calls.length).toBe(0);
    expect(createdSockets.length).toBe(0);
  });

  it('commit 指定でコミット時点のスナップショットを要求する', async () => {
    renderHook(() => useCodeGraph('http://x', { commit: 'abc123', repo: 'repo' }));
    await waitFor(() => {
      expect((globalThis.fetch as jest.Mock).mock.calls.length).toBe(1);
    });
    expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toBe(
      'http://x/api/code-graph?commit=abc123&repo=repo',
    );
  });

  it('commit と release を同時に渡されても release は送らない（サーバは同時指定を 400 で断る）', async () => {
    renderHook(() => useCodeGraph('http://x', { commit: 'abc123', release: 'v1.0.0', repo: 'repo' }));
    await waitFor(() => {
      expect((globalThis.fetch as jest.Mock).mock.calls.length).toBe(1);
    });
    expect(String((globalThis.fetch as jest.Mock).mock.calls[0][0])).not.toContain('release=');
  });
});
