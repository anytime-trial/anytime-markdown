import { createFlightFindingStore } from '../flightFindingStore';
import type { MemoryFlightReviewFindingRow } from '../types';

function finding(overrides: Partial<MemoryFlightReviewFindingRow> = {}): MemoryFlightReviewFindingRow {
  return {
    id: 'rf-1',
    reviewId: 'rev-1',
    instructionId: 'inst-1',
    sessionId: 'sess-1',
    title: 'Session review sess-1',
    reviewer: 'pr-review-toolkit:code-reviewer',
    reviewedAt: '2026-08-05T00:00:00.000Z',
    workspace: 'anytime-markdown',
    targetFilePath: 'packages/trail-viewer/src/a.ts',
    targetRepo: 'anytime-markdown',
    category: 'logic',
    severity: 'error',
    findingText: '条件が反転している',
    addressedCommitSha: null,
    addressedAt: null,
    ...overrides,
  };
}

function stubFetch(impl: (url: string) => Response): { calls: string[] } {
  const calls: string[] = [];
  globalThis.fetch = ((url: string) => {
    calls.push(String(url));
    return Promise.resolve(impl(String(url)));
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

describe('flightFindingStore', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('件数と一覧を取得し、指示単位で絞り込める', async () => {
    stubFetch((url) => {
      if (url.includes('flight-counts')) {
        return jsonResponse([
          { instructionId: 'inst-1', error: 1, warn: 0, info: 0, total: 1 },
          { instructionId: 'inst-2', error: 0, warn: 2, info: 0, total: 2 },
        ]);
      }
      return jsonResponse([finding(), finding({ id: 'rf-2', instructionId: 'inst-2', severity: 'warn' })]);
    });
    const store = createFlightFindingStore('http://x');
    await store.refresh();

    expect(store.getState().loadFailed).toBe(false);
    expect(store.findingsFor('inst-2').map((f) => f.id)).toEqual(['rf-2']);
    expect(store.countsFor('inst-1')?.total).toBe(1);
    // 件数が無い指示は null。呼び出し側が「0 件」と「未取得」を区別できるようにする
    expect(store.countsFor('inst-unknown')).toBeNull();
    store.dispose();
  });

  it('件数は一覧の limit と独立に取る（一覧を数えて件数にしない）', async () => {
    const { calls } = stubFetch((url) =>
      url.includes('flight-counts') ? jsonResponse([]) : jsonResponse([]),
    );
    const store = createFlightFindingStore('http://x', { limit: 42 });
    await store.refresh();

    expect(calls.some((u) => u.endsWith('/api/memory/reviews/flight-counts'))).toBe(true);
    expect(calls.some((u) => u.includes('flight-findings?limit=42'))).toBe(true);
    store.dispose();
  });

  it('取得失敗は loadFailed で示し、0 件と区別する', async () => {
    stubFetch(() => jsonResponse(null, 500));
    const store = createFlightFindingStore('http://x');
    await store.refresh();

    expect(store.getState().loadFailed).toBe(true);
    expect(store.getState().findings).toEqual([]);
    store.dispose();
  });

  it('配列でない応答を空配列へ丸めない（形の違いを「指摘なし」にしない）', async () => {
    stubFetch(() => jsonResponse({ error: 'not configured' }));
    const store = createFlightFindingStore('http://x');
    await store.refresh();

    expect(store.getState().loadFailed).toBe(true);
    store.dispose();
  });

  it('dispose 後に届いた応答で state を書き換えない', async () => {
    stubFetch(() => jsonResponse([finding()]));
    const store = createFlightFindingStore('http://x');
    const notified: number[] = [];
    store.subscribe(() => notified.push(store.getState().findings.length));
    const promise = store.refresh();
    store.dispose();
    await promise;

    // 遅れて届いた応答を反映しない（破棄済みのビューへ通知しない）
    expect(store.getState().findings).toEqual([]);
    expect(notified).not.toContain(1);
  });
});
