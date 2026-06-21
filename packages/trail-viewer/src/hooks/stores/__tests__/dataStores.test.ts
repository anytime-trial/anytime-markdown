/**
 * dataStores.test.ts — unit tests for the three vanilla stores.
 *
 * Uses stub fetch / WebSocket so no real network is required.
 * Asserts: createTrailDataStore fetches → getState reflects data → subscribe fires; dispose cleans up.
 */

import { createTrailDataStore } from '../trailDataStore';
import { createTraceFilesStore } from '../traceFilesStore';
import { createC4DataStore } from '../../../c4/hooks/stores/c4DataStore';

// ---------------------------------------------------------------------------
// Fetch stub helpers
// ---------------------------------------------------------------------------

function makeJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// WebSocket stub
// ---------------------------------------------------------------------------

class StubWebSocket {
  static instances: StubWebSocket[] = [];
  readyState = 0 /* CONNECTING */;
  private handlers: Record<string, ((e: unknown) => void)[]> = {};

  constructor(public url: string) {
    StubWebSocket.instances.push(this);
    // Simulate async connect
    Promise.resolve().then(() => {
      this.readyState = 1; // OPEN
      this._emit('open', {});
    });
  }

  addEventListener(type: string, handler: (e: unknown) => void): void {
    this.handlers[type] ??= [];
    this.handlers[type].push(handler);
  }

  close(): void {
    this.readyState = 3; // CLOSED
    this._emit('close', {});
  }

  send(_data: string): void { /* no-op in tests */ }

  _emit(type: string, event: unknown): void {
    for (const h of this.handlers[type] ?? []) h(event);
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let origFetch: typeof globalThis.fetch;
let origWebSocket: typeof globalThis.WebSocket;

beforeEach(() => {
  StubWebSocket.instances = [];
  origFetch = globalThis.fetch;
  origWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = StubWebSocket as unknown as typeof WebSocket;
});

afterEach(() => {
  globalThis.fetch = origFetch;
  globalThis.WebSocket = origWebSocket;
});

// ---------------------------------------------------------------------------
// createTrailDataStore
// ---------------------------------------------------------------------------

describe('createTrailDataStore', () => {
  function setupFetch(overrides: Record<string, unknown> = {}): void {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String(input);
      if (init?.signal && (init.signal as AbortSignal).aborted) {
        throw Object.assign(new Error('AbortError'), { name: 'AbortError' });
      }
      if (url.includes('/api/trail/sessions') && !url.includes('/messages') && !url.includes('/commits') && !url.includes('/tool-metrics')) {
        return makeJsonResponse(overrides.sessions ?? { sessions: [{ id: 's1', startTime: '2026-01-01' }] });
      }
      if (url.includes('/api/trail/analytics')) {
        return makeJsonResponse(overrides.analytics ?? { totals: { totalCost: 42 } });
      }
      if (url.includes('/api/trail/cost-optimization')) {
        return makeJsonResponse(overrides.costOptimization ?? null, 200);
      }
      if (url.includes('/api/trail/releases')) {
        return makeJsonResponse(overrides.releases ?? []);
      }
      if (url.includes('/api/trail/prompts')) {
        return makeJsonResponse(overrides.prompts ?? { prompts: [{ id: 'p1', content: 'hello' }] });
      }
      return makeJsonResponse({});
    }) as typeof globalThis.fetch;
  }

  it('initial getState returns empty arrays before fetch resolves', () => {
    setupFetch();
    const store = createTrailDataStore('http://localhost:3000');
    const state = store.getState();
    expect(state.sessions).toEqual([]);
    expect(state.loading).toBe(false);
    expect(state.sessionsLoading).toBe(true); // set immediately
    store.dispose();
  });

  it('getState reflects sessions after fetch resolves', async () => {
    setupFetch();
    const store = createTrailDataStore('http://localhost:3000');

    await new Promise<void>((resolve) => {
      const unsub = store.subscribe(() => {
        const s = store.getState();
        if (s.sessions.length > 0) {
          unsub();
          resolve();
        }
      });
    });

    expect(store.getState().sessions).toHaveLength(1);
    expect(store.getState().sessions[0]).toMatchObject({ id: 's1' });
    store.dispose();
  });

  it('subscribe fires when state changes', async () => {
    setupFetch();
    const store = createTrailDataStore('http://localhost:3000');
    const calls: number[] = [];

    const unsub = store.subscribe(() => calls.push(Date.now()));

    // Wait for sessions to load
    await new Promise<void>((resolve) => {
      const inner = store.subscribe(() => {
        if (store.getState().sessions.length > 0) {
          inner();
          resolve();
        }
      });
    });

    expect(calls.length).toBeGreaterThan(0);
    unsub();
    store.dispose();
  });

  it('subscribe returns an unsubscribe function', async () => {
    setupFetch();
    const store = createTrailDataStore('http://localhost:3000');
    let callCount = 0;
    const unsub = store.subscribe(() => { callCount += 1; });
    unsub(); // unsubscribe immediately

    // Wait for async ops to settle
    await new Promise((r) => setTimeout(r, 50));
    expect(callCount).toBe(0);
    store.dispose();
  });

  it('dispose prevents further notify calls', async () => {
    setupFetch();
    const store = createTrailDataStore('http://localhost:3000');
    let callCount = 0;
    store.subscribe(() => { callCount += 1; });
    store.dispose();

    // Wait a bit — no more notifications should arrive
    await new Promise((r) => setTimeout(r, 50));
    expect(callCount).toBe(0);
  });

  it('dispose closes WebSocket', async () => {
    setupFetch();
    const store = createTrailDataStore('http://localhost:3000');

    // Wait for WS to open
    await Promise.resolve();
    await Promise.resolve();

    store.dispose();

    const ws = StubWebSocket.instances.at(-1) as StubWebSocket | undefined;
    if (ws) {
      expect(ws.readyState).toBe(3 /* CLOSED */);
    }
  });

  it('promptsEnabled=false skips prompts fetch', async () => {
    setupFetch();
    const store = createTrailDataStore('http://localhost:3000', { promptsEnabled: false });

    // Wait for initial fetch
    await new Promise((r) => setTimeout(r, 20));

    expect(store.getState().prompts).toEqual([]);
    store.dispose();
  });

  it('getState shape matches TrailDataSourceResult interface', () => {
    setupFetch();
    const store = createTrailDataStore('http://localhost:3000');
    const state = store.getState();

    // Check all required fields are present
    expect(Array.isArray(state.sessions)).toBe(true);
    expect(Array.isArray(state.allSessions)).toBe(true);
    expect(Array.isArray(state.messages)).toBe(true);
    expect(Array.isArray(state.prompts)).toBe(true);
    expect(typeof state.loading).toBe('boolean');
    expect(typeof state.sessionsLoading).toBe('boolean');
    expect(typeof state.connected).toBe('boolean');
    expect(typeof state.loadSession).toBe('function');
    expect(typeof state.searchSessions).toBe('function');
    expect(typeof state.fetchSessionMessages).toBe('function');
    expect(typeof state.fetchSessionCommits).toBe('function');
    expect(typeof state.fetchSessionToolMetrics).toBe('function');
    expect(typeof state.fetchDayToolMetrics).toBe('function');
    expect(typeof state.fetchCostOptimization).toBe('function');
    expect(typeof state.fetchReleases).toBe('function');
    expect(typeof state.fetchCombinedData).toBe('function');
    expect(typeof state.fetchQualityMetrics).toBe('function');
    expect(typeof state.fetchDeploymentFrequency).toBe('function');
    expect(typeof state.fetchReleaseQuality).toBe('function');
    expect(Array.isArray(state.tokenBudgets)).toBe(true);
    store.dispose();
  });

  // Regression: promptsEnabled=false で生成された store は setPromptsEnabled(true) で
  // 初めて prompts を取得する（これが無いと Prompts ポップアップが永久に空になる）。
  it('promptsEnabled=false では fetch せず setPromptsEnabled(true) で取得する', async () => {
    setupFetch();
    const store = createTrailDataStore('http://localhost:3000', { promptsEnabled: false });
    const promptsFetched = (): boolean =>
      (globalThis.fetch as jest.Mock).mock.calls.some(([u]) => String(u).includes('/api/trail/prompts'));

    await new Promise((r) => setTimeout(r, 20));
    expect(promptsFetched()).toBe(false);
    expect(store.getState().prompts).toEqual([]);

    store.setPromptsEnabled(true);
    await new Promise<void>((resolve) => {
      const inner = store.subscribe(() => {
        if (store.getState().prompts.length > 0) { inner(); resolve(); }
      });
    });
    expect(promptsFetched()).toBe(true);
    expect(store.getState().prompts.length).toBeGreaterThan(0);
    store.dispose();
  });
});

// ---------------------------------------------------------------------------
// createTraceFilesStore
// ---------------------------------------------------------------------------

describe('createTraceFilesStore', () => {
  it('returns [] immediately when fetchList is null', () => {
    const store = createTraceFilesStore(null);
    expect(store.getState()).toEqual([]);
    store.dispose();
  });

  it('returns sources after fetchList resolves', async () => {
    const fetchList = jest.fn(async () => [
      { name: 'trace1.json', url: 'http://localhost/trace1.json' },
    ]);
    globalThis.fetch = jest.fn(async () => makeJsonResponse('{}')) as typeof globalThis.fetch;
    const store = createTraceFilesStore(fetchList);

    await new Promise<void>((resolve) => {
      const unsub = store.subscribe(() => {
        if (store.getState().length > 0) {
          unsub();
          resolve();
        }
      });
    });

    const sources = store.getState();
    expect(sources).toHaveLength(1);
    expect(sources[0].name).toBe('trace1.json');
    expect(typeof sources[0].load).toBe('function');
    store.dispose();
  });

  it('subscribe fires when sources are loaded', async () => {
    const fetchList = jest.fn(async () => [{ name: 'a.json', url: 'http://localhost/a.json' }]);
    let fired = false;
    const store = createTraceFilesStore(fetchList);
    const unsub = store.subscribe(() => { fired = true; });

    await new Promise<void>((resolve) => {
      const inner = store.subscribe(() => {
        if (store.getState().length > 0) { inner(); resolve(); }
      });
    });

    expect(fired).toBe(true);
    unsub();
    store.dispose();
  });

  it('dispose cancels in-flight fetch', async () => {
    let resolveList!: (v: readonly { name: string; url: string }[]) => void;
    const fetchList = jest.fn(() => new Promise<readonly { name: string; url: string }[]>((res) => { resolveList = res; }));
    const store = createTraceFilesStore(fetchList);
    let called = false;
    store.subscribe(() => { called = true; });
    store.dispose();

    // Resolve after dispose — should NOT notify
    resolveList([{ name: 'x.json', url: 'http://localhost/x.json' }]);
    await new Promise((r) => setTimeout(r, 20));
    expect(called).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createC4DataStore
// ---------------------------------------------------------------------------

describe('createC4DataStore', () => {
  function setupFetch(): void {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String(input);
      if (init?.signal && (init.signal as AbortSignal).aborted) {
        throw Object.assign(new Error('AbortError'), { name: 'AbortError' });
      }
      if (url.includes('/api/c4/model')) {
        return makeJsonResponse({
          model: { nodes: [], relationships: [] },
          boundaries: [],
        });
      }
      if (url.includes('/api/c4/releases')) {
        return makeJsonResponse([{ tag: 'v1.0.0', repoName: 'my-repo' }]);
      }
      return makeJsonResponse(null, 200);
    }) as typeof globalThis.fetch;
  }

  it('initial getState returns null model', () => {
    setupFetch();
    const store = createC4DataStore('http://localhost:3000', true, false);
    const state = store.getState();
    expect(state.c4Model).toBeNull();
    expect(state.connected).toBe(false);
    store.dispose();
  });

  it('getState shape contains all expected fields', () => {
    setupFetch();
    const store = createC4DataStore('http://localhost:3000', true, false);
    const state = store.getState();

    expect(typeof state.selectedRelease).toBe('string');
    expect(typeof state.selectedRepo).toBe('string');
    expect(typeof state.setSelectedRelease).toBe('function');
    expect(typeof state.setSelectedRepo).toBe('function');
    expect(typeof state.sendCommand).toBe('function');
    expect(typeof state.addElement).toBe('function');
    expect(typeof state.updateElement).toBe('function');
    expect(typeof state.removeElement).toBe('function');
    expect(typeof state.addRelationship).toBe('function');
    expect(typeof state.removeRelationship).toBe('function');
    expect(typeof state.addGroup).toBe('function');
    expect(typeof state.updateGroup).toBe('function');
    expect(typeof state.removeGroup).toBe('function');
    expect(Array.isArray(state.manualGroups)).toBe(true);
    expect(Array.isArray(state.releases)).toBe(true);
    expect(Array.isArray(state.boundaries)).toBe(true);
    expect(Array.isArray(state.docLinks)).toBe(true);
    store.dispose();
  });

  it('subscribe fires when model is fetched', async () => {
    setupFetch();
    const store = createC4DataStore('http://localhost:3000', true /* no WS */, true);
    let fired = false;
    const unsub = store.subscribe(() => { fired = true; });

    await new Promise<void>((resolve) => {
      const inner = store.subscribe(() => {
        if (store.getState().c4Model !== null) { inner(); resolve(); }
      });
    });

    expect(fired).toBe(true);
    unsub();
    store.dispose();
  });

  it('dispose closes WebSocket when WS is enabled', async () => {
    setupFetch();
    const store = createC4DataStore('http://localhost:3000', false, true);

    await Promise.resolve();
    await Promise.resolve();

    store.dispose();

    const ws = StubWebSocket.instances.at(-1) as StubWebSocket | undefined;
    if (ws) {
      expect(ws.readyState).toBe(3 /* CLOSED */);
    }
  });

  it('dispose prevents listener calls after dispose', async () => {
    setupFetch();
    const store = createC4DataStore('http://localhost:3000', true, true);
    let count = 0;
    store.subscribe(() => { count += 1; });
    store.dispose();

    await new Promise((r) => setTimeout(r, 30));
    expect(count).toBe(0);
  });

  // Regression: store は enabled=false で生成され得る（C4 タブ未訪問）。setEnabled(true)
  // で初回 fetch が起動しないと C4 モデルが永久に空になる（表示崩れの真因）。
  it('enabled=false では fetch せず setEnabled(true) で c4 model を取得する', async () => {
    setupFetch();
    const store = createC4DataStore('http://localhost:3000', true /* no WS */, false /* disabled */);
    const modelFetched = (): boolean =>
      (globalThis.fetch as jest.Mock).mock.calls.some(([u]) => String(u).includes('/api/c4/model'));

    // enabled=false: 初回は model fetch されない
    await new Promise((r) => setTimeout(r, 20));
    expect(modelFetched()).toBe(false);
    expect(store.getState().c4Model).toBeNull();

    // 有効化 → model fetch + 取得
    store.setEnabled(true);
    await new Promise<void>((resolve) => {
      const inner = store.subscribe(() => {
        if (store.getState().c4Model !== null) { inner(); resolve(); }
      });
    });
    expect(modelFetched()).toBe(true);
    expect(store.getState().c4Model).not.toBeNull();
    store.dispose();
  });
});
