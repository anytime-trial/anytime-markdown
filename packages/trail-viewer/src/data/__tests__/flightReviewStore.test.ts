import { createFlightReviewStore, type FlightReviewDto } from '../flightReviewStore';

function review(overrides: Partial<FlightReviewDto> = {}): FlightReviewDto {
  return {
    id: 1,
    sessionId: 'sess-1',
    workspacePath: '/ws',
    startedAt: '2026-07-17T09:00:00.000Z',
    endedAt: '2026-07-17T10:00:00.000Z',
    durationSeconds: 3600,
    outcome: 'unknown',
    outcomeSource: 'machine',
    toolCallCount: 10,
    toolFailureCount: 1,
    reworkCount: 2,
    unresolvedItems: '[]',
    nextConcerns: '[]',
    lessonCandidates: '[]',
    tags: '[]',
    notes: '',
    rationaleAuditStatus: 'unaudited',
    createdAt: '2026-07-17T10:00:01.000Z',
    updatedAt: '2026-07-17T10:00:01.000Z',
    ...overrides,
  };
}

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

describe('flightReviewStore', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('enabled=false ならポーリングしない（web-app 埋め込みで叩かない）', async () => {
    const { calls } = stubFetch(() => jsonResponse({ flightReviews: [] }));
    const store = createFlightReviewStore('', { enabled: false });
    await settle();

    expect(calls).toHaveLength(0);
    store.dispose();
  });

  it('refresh で一覧が反映される（FR-16）', async () => {
    stubFetch(() => jsonResponse({ flightReviews: [review()] }));
    const store = createFlightReviewStore('http://x');
    await store.refresh();

    expect(store.getState().reviews).toHaveLength(1);
    expect(store.getState().loadFailed).toBe(false);
    store.dispose();
  });

  it('setFilter がクエリパラメータへ反映される（FR-16）', async () => {
    const { calls } = stubFetch(() => jsonResponse({ flightReviews: [] }));
    const store = createFlightReviewStore('http://x');
    store.setFilter({ outcome: 'achieved', tag: 'release', since: '2026-07-01T00:00:00.000Z' });
    await settle();

    const url = calls.at(-1)?.url ?? '';
    expect(url).toContain('outcome=achieved');
    expect(url).toContain('tag=release');
    expect(url).toContain('since=2026-07-01');
    store.dispose();
  });

  it('取得失敗は loadFailed=true になり空データと区別される', async () => {
    stubFetch(() => {
      throw new Error('down');
    });
    const store = createFlightReviewStore('http://x');
    await store.refresh();

    expect(store.getState().loadFailed).toBe(true);
    expect(store.getState().reviews).toHaveLength(0);
    store.dispose();
  });

  it('select で当該セッションの user feedback を取得する（FR-17）', async () => {
    const { calls } = stubFetch((url) => {
      if (url.includes('/api/trail/user-feedback')) {
        return jsonResponse({
          userFeedback: [
            {
              id: 1,
              sessionId: 'sess-1',
              occurredAt: '2026-07-17T09:30:00.000Z',
              promptExcerpt: 'やり直して',
              matchedPattern: 'やり直',
              createdAt: '2026-07-17T09:30:01.000Z',
            },
          ],
        });
      }
      return jsonResponse({ flightReviews: [] });
    });
    const store = createFlightReviewStore('http://x');
    await store.select('sess-1');

    expect(calls.some((c) => c.url.includes('user-feedback?sessionId=sess-1'))).toBe(true);
    expect(store.getState().selectedFeedback).toHaveLength(1);

    await store.select(null);
    expect(store.getState().selectedSessionId).toBeNull();
    expect(store.getState().selectedFeedback).toHaveLength(0);
    store.dispose();
  });

  it('編集中はポーリング refresh が一覧を上書きしない', async () => {
    let payload: FlightReviewDto[] = [review()];
    stubFetch(() => jsonResponse({ flightReviews: payload }));
    const store = createFlightReviewStore('http://x');
    await store.refresh();
    expect(store.getState().reviews).toHaveLength(1);

    store.setEditing(true);
    payload = [review(), review({ id: 2, sessionId: 'sess-2' })];
    await store.refresh();
    expect(store.getState().reviews).toHaveLength(1);

    store.setEditing(false);
    await settle();
    expect(store.getState().reviews).toHaveLength(2);
    store.dispose();
  });

  it('編集中に別の行を選択すると editing が解除されポーリングが再開する（cross-review 指摘 1）', async () => {
    let payload: FlightReviewDto[] = [review()];
    stubFetch((url) =>
      url.includes('user-feedback') ? jsonResponse({ userFeedback: [] }) : jsonResponse({ flightReviews: payload }),
    );
    const store = createFlightReviewStore('http://x');
    await store.refresh();

    await store.select('sess-1');
    store.setEditing(true);

    // 行切替 = 編集の離脱。editing ラッチが解けて以後の refresh が反映される
    await store.select('sess-2');
    expect(store.getState().editing).toBe(false);

    payload = [review(), review({ id: 2, sessionId: 'sess-2' })];
    await store.refresh();
    expect(store.getState().reviews).toHaveLength(2);
    store.dispose();
  });

  it('saveManual は PATCH を送り、失敗時はサーバーの理由を返す（FR-17）', async () => {
    const { calls } = stubFetch((url, init) => {
      if (init?.method === 'PATCH') {
        return jsonResponse({ error: 'invalid outcome' }, 400);
      }
      return jsonResponse({ flightReviews: [] });
    });
    const store = createFlightReviewStore('http://x');
    const result = await store.saveManual('sess-1', { outcome: 'achieved' });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('invalid outcome');
    const patchCall = calls.find((c) => c.init?.method === 'PATCH');
    expect(patchCall?.url).toBe('http://x/api/trail/flight-reviews/sess-1');
    expect(patchCall?.init?.body).toBe(JSON.stringify({ outcome: 'achieved' }));
    store.dispose();
  });

  it('saveManual 成功で editing が解除され一覧を再取得する（FR-17）', async () => {
    const { calls } = stubFetch((_url, init) =>
      init?.method === 'PATCH' ? jsonResponse({ ok: true }) : jsonResponse({ flightReviews: [review()] }),
    );
    const store = createFlightReviewStore('http://x');
    store.setEditing(true);
    const result = await store.saveManual('sess-1', { tags: ['release'] });

    expect(result.ok).toBe(true);
    expect(store.getState().editing).toBe(false);
    expect(store.getState().saving).toBe(false);
    expect(calls.some((c) => c.url.includes('/api/trail/flight-reviews?') && c.init?.method === undefined)).toBe(true);
    store.dispose();
  });

  it('select で当該セッションの rationale ノードも取得する（FR-24）', async () => {
    const { calls } = stubFetch((url) => {
      if (url.includes('/api/memory/rationale')) {
        return jsonResponse({
          rationale: [
            { commitHash: 'abc123def456', summary: '単純さを優先', confidenceLabel: 'EXTRACTED', recordedAt: '2026-07-17T09:00:00.000Z' },
          ],
        });
      }
      if (url.includes('user-feedback')) return jsonResponse({ userFeedback: [] });
      return jsonResponse({ flightReviews: [] });
    });
    const store = createFlightReviewStore('http://x');
    await store.select('sess-1');

    expect(calls.some((c) => c.url.includes('/api/memory/rationale?sessionId=sess-1'))).toBe(true);
    expect(store.getState().selectedRationale).toHaveLength(1);

    await store.select(null);
    expect(store.getState().selectedRationale).toHaveLength(0);
    store.dispose();
  });

  it('rationale API 失敗は rationale のみ空で縮退する（FR-25）', async () => {
    stubFetch((url) => {
      if (url.includes('/api/memory/rationale')) throw new Error('memory.db missing');
      if (url.includes('user-feedback')) return jsonResponse({ userFeedback: [] });
      return jsonResponse({ flightReviews: [] });
    });
    const store = createFlightReviewStore('http://x');
    await store.select('sess-1');

    expect(store.getState().selectedSessionId).toBe('sess-1');
    expect(store.getState().selectedRationale).toHaveLength(0);
    store.dispose();
  });

  it('dispose でポーリングが止まる', async () => {
    jest.useFakeTimers();
    const { calls } = stubFetch(() => jsonResponse({ flightReviews: [] }));
    const store = createFlightReviewStore('http://x', { enabled: true, pollIntervalMs: 1000 });
    const initialCalls = calls.length;
    store.dispose();
    jest.advanceTimersByTime(5000);

    expect(calls.length).toBe(initialCalls);
  });
});
