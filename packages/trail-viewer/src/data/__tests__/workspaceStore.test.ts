import { createWorkspaceStore } from '../workspaceStore';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('workspaceStore', () => {
  const originalFetch = globalThis.fetch;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    warn.mockRestore();
  });

  function stub(impl: (url: string) => Response): { calls: string[] } {
    const calls: string[] = [];
    globalThis.fetch = ((url: string) => {
      calls.push(String(url));
      return Promise.resolve(impl(String(url)));
    }) as typeof fetch;
    return { calls };
  }

  it('選択肢を取得して保持する', async () => {
    stub(() => jsonResponse({ workspaces: ['anytime-markdown', 'anytime-trade'], partial: false }));
    const store = createWorkspaceStore('http://x');

    await store.refresh();
    await settle();

    expect(store.getState().workspaces).toEqual(['anytime-markdown', 'anytime-trade']);
    expect(store.getState().loadFailed).toBe(false);
    store.dispose();
  });

  it('partial をそのまま持つ（欠けているかもしれない状態を潰さない）', async () => {
    stub(() => jsonResponse({ workspaces: ['anytime-markdown'], partial: true }));
    const store = createWorkspaceStore('http://x');

    await store.refresh();

    expect(store.getState().partial).toBe(true);
    store.dispose();
  });

  it('未解決（空文字）は選択肢に載せない', async () => {
    stub(() => jsonResponse({ workspaces: ['', 'anytime-markdown'], partial: false }));
    const store = createWorkspaceStore('http://x');

    await store.refresh();

    expect(store.getState().workspaces).toEqual(['anytime-markdown']);
    store.dispose();
  });

  // 0 件へ丸めると「そのワークスペースの記録が無い」と読めてしまう。
  it('応答の形が違うときは loadFailed にする（空配列へ丸めない）', async () => {
    stub(() => jsonResponse({ unexpected: true }));
    const store = createWorkspaceStore('http://x');

    await store.refresh();

    expect(store.getState().loadFailed).toBe(true);
    expect(store.getState().workspaces).toEqual([]);
    store.dispose();
  });

  it('サーバー不達は loadFailed にする', async () => {
    globalThis.fetch = (() => Promise.reject(new Error('ECONNREFUSED'))) as typeof fetch;
    const store = createWorkspaceStore('http://x');

    await store.refresh();

    expect(store.getState().loadFailed).toBe(true);
    store.dispose();
  });

  it('serverUrl が空なら取りに行かない（存在しない API を叩かない）', async () => {
    const { calls } = stub(() => jsonResponse({ workspaces: [] }));
    const store = createWorkspaceStore('');

    await store.refresh();

    expect(calls).toEqual([]);
    store.dispose();
  });

  it('dispose 後の応答は状態へ反映しない', async () => {
    stub(() => jsonResponse({ workspaces: ['anytime-markdown'], partial: false }));
    const store = createWorkspaceStore('http://x');

    const pending = store.refresh();
    store.dispose();
    await pending;

    expect(store.getState().workspaces).toEqual([]);
  });
});
