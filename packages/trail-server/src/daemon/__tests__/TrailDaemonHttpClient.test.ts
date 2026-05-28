// TrailDaemonHttpClient のユニットテスト。
// TrailDaemonHost をモックし、call / on の呼び出しを検証する。

import type { SerializableHttpServerOptions } from '../trailDaemonProtocol';
import { TrailDaemonHttpClient } from '../TrailDaemonHttpClient';

/** TrailDaemonHost の最小モック。 */
function makeMockHost() {
  const calls: Array<{ method: string; params: unknown }> = [];
  const listeners = new Map<string, Array<(payload: unknown) => void>>();

  const host = {
    call: jest.fn((method: string, params?: unknown): Promise<unknown> => {
      calls.push({ method, params });
      return Promise.resolve(undefined);
    }),
    on: jest.fn((channel: string, listener: (payload: unknown) => void): (() => void) => {
      let set = listeners.get(channel);
      if (!set) {
        set = [];
        listeners.set(channel, set);
      }
      set.push(listener);
      return () => {
        const s = listeners.get(channel);
        if (s) {
          const idx = s.indexOf(listener);
          if (idx !== -1) s.splice(idx, 1);
        }
      };
    }),
    /** テスト補助: 登録済みリスナーにイベントを emit する。 */
    emit(channel: string, payload: unknown): void {
      for (const l of listeners.get(channel) ?? []) {
        l(payload);
      }
    },
    calls,
    listeners,
  };

  return host;
}

describe('TrailDaemonHttpClient', () => {
  it('start(opts) が host.call("startHttpServer", opts) を発行する', async () => {
    const host = makeMockHost();
    const client = new TrailDaemonHttpClient(host as never);

    const opts: SerializableHttpServerOptions = {
      distPath: '/ext/dist',
      preferredPort: 19841,
    };
    await client.start(opts);

    expect(host.call).toHaveBeenCalledTimes(1);
    expect(host.call).toHaveBeenCalledWith('startHttpServer', opts);
  });

  it('onHttpReady(cb) が host.on("httpReady", cb) で登録される', () => {
    const host = makeMockHost();
    const client = new TrailDaemonHttpClient(host as never);

    const received: Array<{ port: number; url: string }> = [];
    const unsub = client.onHttpReady((info) => received.push(info));

    // host.on が "httpReady" チャネルで呼ばれていることを確認。
    expect(host.on).toHaveBeenCalledTimes(1);
    expect(host.on).toHaveBeenCalledWith('httpReady', expect.any(Function));

    // イベントが届くことを確認。
    host.emit('httpReady', { port: 19841, url: 'http://localhost:19841' });
    expect(received).toEqual([{ port: 19841, url: 'http://localhost:19841' }]);

    // unsubscribe 後はイベントが届かない。
    unsub();
    host.emit('httpReady', { port: 19842, url: 'http://localhost:19842' });
    expect(received).toHaveLength(1);
  });

  it('onHttpReady unsubscribe 関数を返す', () => {
    const host = makeMockHost();
    const client = new TrailDaemonHttpClient(host as never);

    const unsub = client.onHttpReady(() => {});
    expect(typeof unsub).toBe('function');
  });
});
