import {
  resolveOptions,
  getC4Model,
  addElement,
  updateElement,
  removeElement,
  listRelationships,
  addRelationship,
  removeRelationship,
  listGroups,
  addGroup,
  updateGroup,
  removeGroup,
  analyzeCurrentCode,
  analyzeCurrentCodeWithProgress,
  analyzeReleaseCode,
  analyzeAll,
  getAnalyzeStatus,
  listCommunities,
  upsertCommunitySummaries,
  upsertCommunityMappings,
  getCodeGraphExplain,
  getFileAnalysis,
} from '../client';

const ORIGINAL_FETCH = globalThis.fetch;
const URL = 'http://localhost:19841';
const REPO = 'demo';

function mockFetch(responses: Array<{ ok: boolean; status: number; body?: unknown; text?: string }>): jest.Mock {
  const queue = [...responses];
  const fn = jest.fn(async () => {
    const r = queue.shift();
    if (!r) throw new Error('fetch called more times than mocked');
    return {
      ok: r.ok,
      status: r.status,
      json: async () => r.body,
      text: async () => r.text ?? '',
    } as unknown as Response;
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('client.ts', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
  });

  describe('resolveOptions', () => {
    test('defaults are applied when fields are omitted', () => {
      const opts = resolveOptions({});
      expect(opts.serverUrl).toBe('http://localhost:19841');
      expect(typeof opts.repoName).toBe('string');
      expect(opts.repoName.length).toBeGreaterThan(0);
    });

    test('user values override defaults', () => {
      const opts = resolveOptions({ serverUrl: 'http://other:1234', repoName: 'custom' });
      expect(opts.serverUrl).toBe('http://other:1234');
      expect(opts.repoName).toBe('custom');
    });
  });

  describe('request error handling', () => {
    test('non-OK response throws with status + body text', async () => {
      mockFetch([{ ok: false, status: 500, text: 'boom' }]);
      await expect(getC4Model(URL, REPO)).rejects.toThrow(/500: boom/);
    });

    test('204 No Content returns undefined without parsing body', async () => {
      const fetchMock = mockFetch([{ ok: true, status: 204 }]);
      await expect(removeElement(URL, REPO, 'el-1')).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('C4 manual element endpoints', () => {
    test('getC4Model issues GET with encoded repoName', async () => {
      const fetchMock = mockFetch([{ ok: true, status: 200, body: { ok: true } }]);
      const res = await getC4Model(URL, 'has space');
      expect(res).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:19841/api/c4/model?repoName=has%20space',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    test('addElement issues POST with JSON body', async () => {
      const fetchMock = mockFetch([{ ok: true, status: 200, body: { id: 'el-1' } }]);
      const body = { type: 'Service', name: 'X', external: false, parentId: null };
      const res = await addElement(URL, REPO, body);
      expect(res).toEqual({ id: 'el-1' });
      const call = fetchMock.mock.calls[0];
      expect(call[1].method).toBe('POST');
      expect(call[1].headers).toEqual({ 'Content-Type': 'application/json' });
      expect(JSON.parse(call[1].body as string)).toEqual(body);
    });

    test('updateElement issues PATCH at id path', async () => {
      const fetchMock = mockFetch([{ ok: true, status: 200, body: { id: 'el-1' } }]);
      await updateElement(URL, REPO, 'el-1', { name: 'X' });
      expect(fetchMock.mock.calls[0][0]).toContain('/api/c4/manual-elements/el-1');
      expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
    });

    test('removeElement issues DELETE', async () => {
      const fetchMock = mockFetch([{ ok: true, status: 204 }]);
      await removeElement(URL, REPO, 'el-2');
      expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    });
  });

  describe('relationship endpoints', () => {
    test('listRelationships GET', async () => {
      const fetchMock = mockFetch([{ ok: true, status: 200, body: { relationships: [] } }]);
      await listRelationships(URL, REPO);
      expect(fetchMock.mock.calls[0][1].method).toBe('GET');
    });

    test('addRelationship POST with body', async () => {
      const fetchMock = mockFetch([{ ok: true, status: 200, body: { id: 'r-1' } }]);
      await addRelationship(URL, REPO, { fromId: 'a', toId: 'b' });
      expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ fromId: 'a', toId: 'b' });
    });

    test('removeRelationship DELETE', async () => {
      const fetchMock = mockFetch([{ ok: true, status: 204 }]);
      await removeRelationship(URL, REPO, 'r-2');
      expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    });
  });

  describe('group endpoints', () => {
    test('listGroups GET', async () => {
      const fetchMock = mockFetch([{ ok: true, status: 200, body: { groups: [] } }]);
      await listGroups(URL, REPO);
      expect(fetchMock.mock.calls[0][1].method).toBe('GET');
    });

    test('addGroup POST', async () => {
      const fetchMock = mockFetch([{ ok: true, status: 200, body: { id: 'g-1' } }]);
      await addGroup(URL, REPO, { memberIds: ['x'] });
      expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    });

    test('updateGroup PATCH', async () => {
      const fetchMock = mockFetch([{ ok: true, status: 200, body: { id: 'g-1' } }]);
      await updateGroup(URL, REPO, 'g-1', { label: 'L' });
      expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
    });

    test('removeGroup DELETE', async () => {
      const fetchMock = mockFetch([{ ok: true, status: 204 }]);
      await removeGroup(URL, REPO, 'g-1');
      expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    });
  });

  describe('analyze endpoints', () => {
    test('analyzeCurrentCode POST with body', async () => {
      const fetchMock = mockFetch([{ ok: true, status: 200, body: { status: 'started' } }]);
      await analyzeCurrentCode(URL, { workspacePath: '/ws' });
      expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    });

    test('analyzeCurrentCode without body uses default empty object', async () => {
      const fetchMock = mockFetch([{ ok: true, status: 200, body: { status: 'started' } }]);
      await analyzeCurrentCode(URL);
      expect(fetchMock.mock.calls[0][1].method).toBe('POST');
      // デフォルト body = {} が送られる
      expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({});
    });

    test('analyzeReleaseCode POST without body', async () => {
      const fetchMock = mockFetch([{ ok: true, status: 200, body: { status: 'started' } }]);
      await analyzeReleaseCode(URL);
      expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    });

    test('analyzeAll POST', async () => {
      mockFetch([{ ok: true, status: 200, body: { status: 'started' } }]);
      await analyzeAll(URL);
    });

    test('getAnalyzeStatus GET', async () => {
      const fetchMock = mockFetch([{ ok: true, status: 200, body: { running: false } }]);
      await getAnalyzeStatus(URL);
      expect(fetchMock.mock.calls[0][1].method).toBe('GET');
    });
  });

  describe('analyzeCurrentCodeWithProgress', () => {
    type Listener = (ev?: { data?: unknown }) => void;
    class StubWebSocket {
      static last: StubWebSocket | null = null;
      listeners = new Map<string, Listener[]>();
      closed = false;
      constructor(public url: string) {
        StubWebSocket.last = this;
        setImmediate(() => {
          for (const l of this.listeners.get('open') ?? []) l();
        });
      }
      addEventListener(type: string, fn: Listener): void {
        const list = this.listeners.get(type) ?? [];
        list.push(fn);
        this.listeners.set(type, list);
      }
      removeEventListener(type: string, fn: Listener): void {
        const list = this.listeners.get(type) ?? [];
        this.listeners.set(type, list.filter((x) => x !== fn));
      }
      close(): void { this.closed = true; }
      emit(type: string, ev?: { data?: unknown }): void {
        for (const l of this.listeners.get(type) ?? []) l(ev);
      }
    }

    const ORIGINAL_WS = (globalThis as { WebSocket?: unknown }).WebSocket;

    afterEach(() => {
      (globalThis as { WebSocket?: unknown }).WebSocket = ORIGINAL_WS;
      StubWebSocket.last = null;
    });

    test('falls back to empty progressLog when WebSocket is unavailable', async () => {
      (globalThis as { WebSocket?: unknown }).WebSocket = undefined;
      mockFetch([{ ok: true, status: 200, body: { status: 'started' } }]);
      const res = await analyzeCurrentCodeWithProgress(URL, { workspacePath: '/ws' });
      expect(res.progressLog).toEqual([]);
      expect((res as unknown as { status: string }).status).toBe('started');
    });

    test('analyzeCurrentCodeWithProgress without body uses default empty object', async () => {
      (globalThis as { WebSocket?: unknown }).WebSocket = undefined;
      mockFetch([{ ok: true, status: 200, body: { status: 'started' } }]);
      const res = await analyzeCurrentCodeWithProgress(URL);
      expect(res.progressLog).toEqual([]);
    });

    test('collects progress events from WebSocket and closes socket on finally', async () => {
      (globalThis as { WebSocket?: unknown }).WebSocket = StubWebSocket as unknown as typeof WebSocket;
      mockFetch([{ ok: true, status: 200, body: { status: 'started' } }]);

      // Drive analyzeCurrentCode after the WS has been opened
      const promise = analyzeCurrentCodeWithProgress(URL, {});
      // wait a tick for the StubWebSocket open + listener registration
      await new Promise((r) => setImmediate(r));
      const ws = StubWebSocket.last;
      ws?.emit('message', { data: JSON.stringify({ type: 'analysis-progress', phase: 'parse', percent: 30 }) });
      ws?.emit('message', { data: 'INVALID' }); // 不正 JSON は無視
      ws?.emit('message', { data: JSON.stringify({ type: 'analysis-progress', phase: 'done' }) }); // percent 欠落 → -1
      // event.data が string 以外の場合は String() で変換される（行 236 の else 分岐）
      ws?.emit('message', { data: 42 }); // 数値 → String(42) → JSON.parse エラー → 無視

      const res = await promise;
      expect(res.progressLog).toEqual([
        { phase: 'parse', percent: 30, ts: expect.any(Number) },
        { phase: 'done', percent: -1, ts: expect.any(Number) },
      ]);
      expect(ws?.closed).toBe(true);
    });

    test('survives WebSocket construction error and runs analyze anyway', async () => {
      class BrokenWS {
        constructor() { throw new Error('cannot construct'); }
      }
      (globalThis as { WebSocket?: unknown }).WebSocket = BrokenWS as unknown as typeof WebSocket;
      mockFetch([{ ok: true, status: 200, body: { status: 'started' } }]);
      const res = await analyzeCurrentCodeWithProgress(URL, {});
      expect(res.progressLog).toEqual([]);
    });

    test('WebSocket error イベント時は ws を undefined にして analyze を続行する', async () => {
      class ErrorOnOpenWS {
        static last: ErrorOnOpenWS | null = null;
        listeners = new Map<string, Array<(ev?: unknown) => void>>();
        closed = false;
        constructor(public url: string) {
          ErrorOnOpenWS.last = this;
          // error を次の tick で発火
          setImmediate(() => {
            for (const l of this.listeners.get('error') ?? []) l();
          });
        }
        addEventListener(type: string, fn: (ev?: unknown) => void): void {
          const list = this.listeners.get(type) ?? [];
          list.push(fn);
          this.listeners.set(type, list);
        }
        removeEventListener(type: string, fn: (ev?: unknown) => void): void {
          const list = this.listeners.get(type) ?? [];
          this.listeners.set(type, list.filter((x) => x !== fn));
        }
        close(): void { this.closed = true; }
      }

      (globalThis as { WebSocket?: unknown }).WebSocket = ErrorOnOpenWS as unknown as typeof WebSocket;
      mockFetch([{ ok: true, status: 200, body: { status: 'started' } }]);

      const res = await analyzeCurrentCodeWithProgress(URL, {});
      // error 後は ws が undefined になって以降の処理が続行される
      expect(res.progressLog).toEqual([]);
      expect((res as unknown as { status: string }).status).toBe('started');
    });

    test('analyzeCurrentCode が throw しても ws.close() が呼ばれる', async () => {
      class CloseTrackingWS {
        static last: CloseTrackingWS | null = null;
        listeners = new Map<string, Array<() => void>>();
        closed = false;
        constructor() {
          CloseTrackingWS.last = this;
          setImmediate(() => {
            for (const l of this.listeners.get('open') ?? []) l();
          });
        }
        addEventListener(type: string, fn: () => void): void {
          const list = this.listeners.get(type) ?? [];
          list.push(fn);
          this.listeners.set(type, list);
        }
        removeEventListener(type: string, fn: () => void): void {
          const list = this.listeners.get(type) ?? [];
          this.listeners.set(type, list.filter((x) => x !== fn));
        }
        close(): void { this.closed = true; }
      }

      (globalThis as { WebSocket?: unknown }).WebSocket = CloseTrackingWS as unknown as typeof WebSocket;
      mockFetch([{ ok: false, status: 500, text: 'server error' }]);

      await expect(analyzeCurrentCodeWithProgress(URL, {})).rejects.toThrow(/500/);
      // finally で ws.close() が呼ばれること
      expect(CloseTrackingWS.last?.closed).toBe(true);
    });

    test('ws.close() が例外を投げても analyze 結果は正常に返る（catch で無視される）', async () => {
      class ThrowingCloseWS {
        listeners = new Map<string, Array<() => void>>();
        constructor() {
          setImmediate(() => {
            for (const l of this.listeners.get('open') ?? []) l();
          });
        }
        addEventListener(type: string, fn: () => void): void {
          const list = this.listeners.get(type) ?? [];
          list.push(fn);
          this.listeners.set(type, list);
        }
        removeEventListener(type: string, fn: () => void): void {
          const list = this.listeners.get(type) ?? [];
          this.listeners.set(type, list.filter((x) => x !== fn));
        }
        close(): void { throw new Error('ws close failed'); }
      }

      (globalThis as { WebSocket?: unknown }).WebSocket = ThrowingCloseWS as unknown as typeof WebSocket;
      mockFetch([{ ok: true, status: 200, body: { status: 'started' } }]);

      // ws.close() の例外は catch {} で無視されるため正常に返る
      const res = await analyzeCurrentCodeWithProgress(URL, {});
      expect(res.progressLog).toEqual([]);
      expect((res as unknown as { status: string }).status).toBe('started');
    });

    test('非 analysis-progress type の message は progressLog に追加しない', async () => {
      type Listener = (ev?: { data?: unknown }) => void;
      class MixedMessageWS {
        static last: MixedMessageWS | null = null;
        listeners = new Map<string, Listener[]>();
        closed = false;
        constructor() {
          MixedMessageWS.last = this;
          setImmediate(() => {
            for (const l of this.listeners.get('open') ?? []) l();
          });
        }
        addEventListener(type: string, fn: Listener): void {
          const list = this.listeners.get(type) ?? [];
          list.push(fn);
          this.listeners.set(type, list);
        }
        removeEventListener(type: string, fn: Listener): void {
          const list = this.listeners.get(type) ?? [];
          this.listeners.set(type, list.filter((x) => x !== fn));
        }
        close(): void { this.closed = true; }
        emit(type: string, ev?: { data?: unknown }): void {
          for (const l of this.listeners.get(type) ?? []) l(ev);
        }
      }

      (globalThis as { WebSocket?: unknown }).WebSocket = MixedMessageWS as unknown as typeof WebSocket;
      mockFetch([{ ok: true, status: 200, body: { status: 'started' } }]);

      const promise = analyzeCurrentCodeWithProgress(URL, {});
      await new Promise((r) => setImmediate(r));
      const ws = MixedMessageWS.last;
      // analysis-progress 以外の type は無視される
      ws?.emit('message', { data: JSON.stringify({ type: 'heartbeat', phase: 'ignored' }) });
      // analysis-progress は追加される
      ws?.emit('message', { data: JSON.stringify({ type: 'analysis-progress', phase: 'build', percent: 50 }) });
      // phase が string でない場合は無視される
      ws?.emit('message', { data: JSON.stringify({ type: 'analysis-progress', phase: 42 }) });

      const res = await promise;
      expect(res.progressLog).toHaveLength(1);
      expect(res.progressLog[0].phase).toBe('build');
      expect(res.progressLog[0].percent).toBe(50);
    });
  });

  describe('discovery HTTP callers', () => {
    test('getCodeGraphExplain → GET /api/code-graph/explain?id=&repo=', async () => {
      const payload = { node: { id: 'a.ts' }, incoming: [], outgoing: [] };
      const fetchMock = mockFetch([{ ok: true, status: 200, body: payload }]);
      const out = await getCodeGraphExplain(URL, 'pkg/a.ts', 'repo1');
      expect(out).toEqual(payload);
      expect(fetchMock.mock.calls[0][0]).toBe(`${URL}/api/code-graph/explain?id=pkg%2Fa.ts&repo=repo1`);
    });

    test('getFileAnalysis → GET /api/c4/file-analysis?repo=&tag=current', async () => {
      const payload = { entries: [], elementMatrix: {} };
      const fetchMock = mockFetch([{ ok: true, status: 200, body: payload }]);
      const out = await getFileAnalysis(URL, 'repo1');
      expect(out).toEqual(payload);
      expect(fetchMock.mock.calls[0][0]).toBe(`${URL}/api/c4/file-analysis?repo=repo1&tag=current`);
    });
  });

  describe('community endpoints', () => {
    test('listCommunities GET', async () => {
      const fetchMock = mockFetch([{ ok: true, status: 200, body: { communities: [] } }]);
      await listCommunities(URL, REPO);
      expect(fetchMock.mock.calls[0][1].method).toBe('GET');
    });

    test('upsertCommunitySummaries POST', async () => {
      const fetchMock = mockFetch([{ ok: true, status: 200, body: { updated: 1 } }]);
      await upsertCommunitySummaries(URL, REPO, [{ communityId: 1, name: 'n', summary: 's' }]);
      expect(fetchMock.mock.calls[0][1].method).toBe('POST');
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.repoName).toBe(REPO);
      expect(body.summaries).toHaveLength(1);
    });

    test('upsertCommunityMappings POST', async () => {
      const fetchMock = mockFetch([{ ok: true, status: 200, body: { updated: 0, inserted: 1 } }]);
      await upsertCommunityMappings(URL, REPO, [{ communityId: 1, mappings: [] }]);
      expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    });
  });
});
