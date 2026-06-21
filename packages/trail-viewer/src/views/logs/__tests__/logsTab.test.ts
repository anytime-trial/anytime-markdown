/**
 * logsTab vanilla mount のユニットテスト。
 * jsdom 環境で mountLogsTab を直接呼び、toolbar/table/detail の DOM 描画・
 * モード切替・フィルタ変更・pause/resume・update/destroy を検証する。
 * ネットワークは使わない（fetcher をスタブに差し替える）。
 */
import type { WsLogBatchMessage } from '../../../c4/hooks/c4WsMessages';
import type { WsSubscribe } from '../../../hooks/useLogsDataSource';
import { mountLogsTab, type LogsTabProps } from '../logsTab';

// ---------------------------------------------------------------------------
// Stub helpers
// ---------------------------------------------------------------------------

function makeFetcher(responses: Array<{ logs: unknown[]; nextCursor: string | null }>): {
  fetcher: typeof fetch;
  calls: string[];
} {
  const calls: string[] = [];
  let idx = 0;
  const fetcher = (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    calls.push(String(input));
    const body = responses[idx] ?? { logs: [], nextCursor: null };
    idx += 1;
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(body),
    } as unknown as Response);
  };
  return { fetcher, calls };
}

/** Returns a subscribe stub and a trigger helper to push messages */
function makeSubscribe(): {
  subscribe: WsSubscribe;
  push: (msg: WsLogBatchMessage) => void;
  unsubCount: number;
} {
  let handler: ((msg: WsLogBatchMessage) => void) | null = null;
  let unsubCount = 0;
  const stub: WsSubscribe & { unsubCount: number } = Object.assign(
    (h: (msg: WsLogBatchMessage) => void) => {
      handler = h;
      return () => {
        handler = null;
        unsubCount += 1;
      };
    },
    { unsubCount: 0 },
  );
  return {
    subscribe: stub,
    push: (msg) => { handler?.(msg); },
    get unsubCount() { return unsubCount; },
  };
}

function baseProps(over: Partial<LogsTabProps> = {}): LogsTabProps {
  const { fetcher, calls: _calls } = makeFetcher([{ logs: [], nextCursor: null }]);
  return {
    baseUrl: 'http://localhost:7531',
    subscribe: makeSubscribe().subscribe,
    t: (k) => k,
    fetcher,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mountLogsTab – DOM render', () => {
  it('mounts toolbar and empty message (no logs)', async () => {
    const { fetcher } = makeFetcher([{ logs: [], nextCursor: null }]);
    const ws = makeSubscribe();
    const c = document.createElement('div');
    const handle = mountLogsTab(c, {
      ...baseProps(),
      subscribe: ws.subscribe,
      fetcher,
    });

    // toolbar exists (mode toggle: live / history)
    expect(c.querySelector('[aria-label="mode"]')).not.toBeNull();
    // no grid yet
    expect(c.querySelector('[role="grid"]')).toBeNull();

    handle.destroy();
    expect(c.childElementCount).toBe(0);
  });

  it('WS push renders log rows', async () => {
    const { fetcher } = makeFetcher([{ logs: [], nextCursor: null }]);
    const ws = makeSubscribe();
    const c = document.createElement('div');
    mountLogsTab(c, { ...baseProps(), subscribe: ws.subscribe, fetcher });

    ws.push({
      type: 'log-batch',
      logs: [
        { id: 1, timestamp: '2026-06-21T00:00:00.000Z', level: 'info', source: 'daemon', component: 'comp', message: 'hello' },
      ],
    });

    const grid = c.querySelector('[role="grid"]');
    expect(grid).not.toBeNull();
    expect(c.textContent).toContain('hello');
  });
});

describe('mountLogsTab – mode change', () => {
  it('switching to history mode triggers a fetch', async () => {
    const { fetcher, calls } = makeFetcher([
      { logs: [], nextCursor: null }, // live initial
      { logs: [{ id: 2, timestamp: '2026-06-21T00:00:00.000Z', level: 'warn', source: 'extension', component: 'c', message: 'hist' }], nextCursor: null },
    ]);
    const ws = makeSubscribe();
    const c = document.createElement('div');
    mountLogsTab(c, { ...baseProps(), subscribe: ws.subscribe, fetcher });

    // click the history mode button
    const modeGroup = c.querySelector('[aria-label="mode"]') as HTMLElement;
    const histBtn = [...modeGroup.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('logs.mode.history'),
    ) as HTMLButtonElement | undefined;
    histBtn?.click();

    // wait for microtasks (fetch is async)
    await Promise.resolve();
    await Promise.resolve();

    expect(calls.some((u) => u.includes('/api/logs'))).toBe(true);
  });
});

describe('mountLogsTab – filter change', () => {
  it('filter change in history mode triggers new fetch', async () => {
    const { fetcher, calls } = makeFetcher([
      { logs: [], nextCursor: null }, // live initial
      { logs: [], nextCursor: null }, // history fetch
      { logs: [], nextCursor: null }, // filter re-fetch
    ]);
    const ws = makeSubscribe();
    const c = document.createElement('div');
    mountLogsTab(c, { ...baseProps(), subscribe: ws.subscribe, fetcher });

    // switch to history
    const modeGroup = c.querySelector('[aria-label="mode"]') as HTMLElement;
    const histBtn = [...modeGroup.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('logs.mode.history'),
    ) as HTMLButtonElement | undefined;
    histBtn?.click();
    await Promise.resolve();

    const prevCallCount = calls.length;

    // uncheck a level filter
    const levelGroup = c.querySelector('[aria-label="level"]') as HTMLElement;
    const infoBtn = [...levelGroup.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('logs.level.info'),
    ) as HTMLButtonElement | undefined;
    infoBtn?.click();
    await Promise.resolve();

    expect(calls.length).toBeGreaterThan(prevCallCount);
  });
});

describe('mountLogsTab – pause / resume', () => {
  it('pause queues WS messages; resume flushes them', async () => {
    const { fetcher } = makeFetcher([{ logs: [], nextCursor: null }]);
    const ws = makeSubscribe();
    const c = document.createElement('div');
    mountLogsTab(c, { ...baseProps(), subscribe: ws.subscribe, fetcher });

    // pause
    const pauseBtn = c.querySelector('[aria-label="pause"]') as HTMLButtonElement;
    pauseBtn.click();

    // push while paused — grid should NOT yet show it
    ws.push({
      type: 'log-batch',
      logs: [{ id: 10, timestamp: '2026-06-21T00:00:00.000Z', level: 'info', source: 'daemon', component: 'c', message: 'queued' }],
    });
    expect(c.querySelector('[role="grid"]')).toBeNull();

    // resume
    const resumeBtn = c.querySelector('[aria-label="resume"]') as HTMLButtonElement;
    resumeBtn.click();

    expect(c.querySelector('[role="grid"]')).not.toBeNull();
    expect(c.textContent).toContain('queued');
  });
});

describe('mountLogsTab – update / destroy', () => {
  it('update() reflects new t function', () => {
    const { fetcher } = makeFetcher([{ logs: [], nextCursor: null }]);
    const ws = makeSubscribe();
    const c = document.createElement('div');
    const handle = mountLogsTab(c, { ...baseProps(), subscribe: ws.subscribe, fetcher });

    const newT = (k: string): string => `TRANSLATED:${k}`;
    handle.update({ ...baseProps(), subscribe: ws.subscribe, fetcher, t: newT });

    // empty message should now use the new t function
    expect(c.textContent).toContain('TRANSLATED:logs.empty');
  });

  it('destroy() aborts in-flight fetch and unsubscribes WS', async () => {
    let abortCalled = false;
    const fetcher = (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      init?.signal?.addEventListener('abort', () => { abortCalled = true; });
      // never resolves — simulates in-flight
      return new Promise(() => {});
    };
    const ws = makeSubscribe();
    const c = document.createElement('div');
    const handle = mountLogsTab(c, { ...baseProps(), subscribe: ws.subscribe, fetcher });

    handle.destroy();

    expect(abortCalled).toBe(true);
    expect(ws.unsubCount).toBeGreaterThan(0);
    expect(c.childElementCount).toBe(0);
  });
});
