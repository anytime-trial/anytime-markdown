import { createEmergencyStore } from '../emergencyStore';

/** fetch を差し替えて応答を制御する。呼び出し記録も返す。 */
function stubFetch(
  impl: (url: string, init?: RequestInit) => Promise<Response> | Response,
): { calls: { url: string; init?: RequestInit }[] } {
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return Promise.resolve(impl(String(url), init));
  }) as typeof fetch;
  return { calls };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/** マイクロタスクを消化する（fetch → state 反映を待つ）。 */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe('emergencyStore', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('初期状態は unknown（平常と決めつけない）', () => {
    stubFetch(() => new Promise<Response>(() => undefined));
    const store = createEmergencyStore('', { enabled: false });
    expect(store.getState().status).toBe('unknown');
    store.dispose();
  });

  it('enabled=false ならポーリングしない（web-app 埋め込みで叩かない）', async () => {
    const { calls } = stubFetch(() => jsonResponse({ active: false }));
    const store = createEmergencyStore('', { enabled: false });
    await settle();

    expect(calls).toHaveLength(0);
    store.dispose();
  });

  it('active:false を inactive として反映する', async () => {
    stubFetch(() => jsonResponse({ active: false }));
    const store = createEmergencyStore('', { enabled: true });
    await settle();

    expect(store.getState().status).toBe('inactive');
    store.dispose();
  });

  it('発動中は理由・発動者・発動時刻を保持する', async () => {
    stubFetch(() =>
      jsonResponse({
        active: true,
        reason: 'runaway loop',
        triggeredBy: 'loop-detector',
        triggeredAt: '2026-07-16T10:00:00.000Z',
      }),
    );
    const store = createEmergencyStore('', { enabled: true });
    await settle();

    const state = store.getState();
    expect(state.status).toBe('active');
    expect(state.reason).toBe('runaway loop');
    expect(state.triggeredBy).toBe('loop-detector');
    expect(state.triggeredAt).toBe('2026-07-16T10:00:00.000Z');
    store.dispose();
  });

  it('サーバー応答が非 200 なら unknown（inactive と混同しない）', async () => {
    stubFetch(() => jsonResponse({ error: 'gitRoot is not configured' }, 409));
    const store = createEmergencyStore('', { enabled: true });
    await settle();

    expect(store.getState().status).toBe('unknown');
    store.dispose();
  });

  it('fetch 例外（サーバー停止）でも unknown へ落として例外を投げない', async () => {
    stubFetch(() => Promise.reject(new Error('ECONNREFUSED')));
    const store = createEmergencyStore('', { enabled: true });
    await settle();

    expect(store.getState().status).toBe('unknown');
    store.dispose();
  });

  it('状態変化で購読者へ通知する', async () => {
    let active = false;
    stubFetch(() => jsonResponse(active ? { active: true, reason: 'r', triggeredBy: 'human', triggeredAt: 't' } : { active: false }));
    const store = createEmergencyStore('', { enabled: true });
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    await settle();

    expect(store.getState().status).toBe('inactive');
    listener.mockClear();

    active = true;
    await store.refresh();
    await settle();

    expect(store.getState().status).toBe('active');
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    store.dispose();
  });

  it('dispose 後はポーリングを止め state を更新しない', async () => {
    jest.useFakeTimers();
    const { calls } = stubFetch(() => jsonResponse({ active: false }));
    const store = createEmergencyStore('', { enabled: true, pollIntervalMs: 1000 });
    await settle();
    const before = calls.length;

    store.dispose();
    jest.advanceTimersByTime(5000);
    await settle();

    expect(calls.length).toBe(before);
  });

  describe('操作 API', () => {
    it('activate はカスタムヘッダ付きで POST する', async () => {
      const { calls } = stubFetch((url) =>
        url.includes('kill-switch') ? jsonResponse({ ok: true }) : jsonResponse({ active: false }),
      );
      const store = createEmergencyStore('', { enabled: false });

      const result = await store.activate('runaway');

      expect(result.ok).toBe(true);
      const post = calls.find((c) => c.url.includes('kill-switch'));
      expect(post?.init?.method).toBe('POST');
      expect((post?.init?.headers as Record<string, string>)['X-Anytime-Emergency']).toBe('1');
      expect((post?.init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
      expect(JSON.parse(post?.init?.body as string)).toEqual({ reason: 'runaway' });
      store.dispose();
    });

    it('サーバーのエラーメッセージを失敗理由として返す（無言で失敗しない）', async () => {
      stubFetch(() => jsonResponse({ error: 'Kill Switch is not active' }, 409));
      const store = createEmergencyStore('', { enabled: false });

      const result = await store.release('done');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Kill Switch is not active');
      store.dispose();
    });

    it('rollback は recoverBranch を返す', async () => {
      stubFetch(() => jsonResponse({ ok: true, recoverBranch: 'recover-abc12345' }));
      const store = createEmergencyStore('', { enabled: false });

      const result = await store.rollback('abc12345def');

      expect(result.ok).toBe(true);
      expect(result.recoverBranch).toBe('recover-abc12345');
      store.dispose();
    });

    it('通信断は ok:false と理由を返す（例外を投げない）', async () => {
      stubFetch(() => Promise.reject(new Error('ECONNREFUSED')));
      const store = createEmergencyStore('', { enabled: false });

      const result = await store.activate('x');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('ECONNREFUSED');
      store.dispose();
    });
  });

  describe('safe points', () => {
    it('一覧を取得して返す', async () => {
      stubFetch(() =>
        jsonResponse({
          safePoints: [
            { id: 1, createdAt: '2026-07-16T10:00:00.000Z', commitHash: 'abc12345def', branch: 'develop', worktree: '/w', label: '', source: 'stop_hook', sessionId: null },
          ],
        }),
      );
      const store = createEmergencyStore('', { enabled: false });

      const points = await store.fetchSafePoints();

      expect(points).toHaveLength(1);
      expect(points[0]?.commitHash).toBe('abc12345def');
      store.dispose();
    });

    it('取得失敗は空配列（UI を壊さない）', async () => {
      stubFetch(() => Promise.reject(new Error('down')));
      const store = createEmergencyStore('', { enabled: false });

      expect(await store.fetchSafePoints()).toEqual([]);
      store.dispose();
    });
  });
});
