import { createFetchGitHubReviewClient } from '../GitHubReviewClient';

function res(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `S${status}`,
    headers: new Headers(headers),
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

/** スクリプト化したレスポンスを順に返す fake fetch。呼ばれた URL を記録する。 */
function scriptedFetch(responses: Response[]): {
  fetchImpl: (url: string) => Promise<Response>;
  urls: string[];
} {
  const urls: string[] = [];
  let i = 0;
  return {
    urls,
    fetchImpl: async (url: string) => {
      urls.push(url);
      const r = responses[Math.min(i, responses.length - 1)];
      i += 1;
      return r;
    },
  };
}

const noSleep = async () => undefined;

describe('createFetchGitHubReviewClient', () => {
  it('lists pull numbers and filters by since', async () => {
    const { fetchImpl, urls } = scriptedFetch([
      res(200, [
        { number: 3, updated_at: '2026-03-01T00:00:00Z' },
        { number: 2, updated_at: '2026-01-01T00:00:00Z' },
      ]),
    ]);
    const client = createFetchGitHubReviewClient({ token: 't', fetchImpl, sleep: noSleep });

    const pulls = await client.listPullNumbers('o', 'r', { since: '2026-02-01T00:00:00Z', maxPrs: 50 });
    expect(pulls).toEqual([{ number: 3, updatedAt: '2026-03-01T00:00:00Z' }]);
    expect(urls[0]).toContain('/repos/o/r/pulls?state=all&sort=updated&direction=desc&per_page=50');
  });

  it('maps reviews (null body → empty, missing submitted_at → null)', async () => {
    const { fetchImpl } = scriptedFetch([
      res(200, [
        { id: 10, user: { login: 'alice' }, state: 'APPROVED', submitted_at: '2026-01-02T00:00:00Z', body: 'lgtm' },
        { id: 11, user: null, state: 'PENDING', submitted_at: null, body: null },
      ]),
    ]);
    const client = createFetchGitHubReviewClient({ token: 't', fetchImpl, sleep: noSleep });

    const reviews = await client.listReviews('o', 'r', 5);
    expect(reviews).toEqual([
      { id: 10, author: 'alice', state: 'APPROVED', submittedAt: '2026-01-02T00:00:00Z', body: 'lgtm' },
      { id: 11, author: '', state: 'PENDING', submittedAt: null, body: '' },
    ]);
  });

  it('maps review comments with line/original_line fallback', async () => {
    const { fetchImpl } = scriptedFetch([
      res(200, [
        { pull_request_review_id: 10, path: 'a.ts', line: 12, body: 'fix' },
        { pull_request_review_id: 10, path: 'b.ts', line: null, original_line: 7, body: 'nit' },
        { pull_request_review_id: null, path: 'c.ts', line: null, original_line: null, body: 'orphan' },
      ]),
    ]);
    const client = createFetchGitHubReviewClient({ token: 't', fetchImpl, sleep: noSleep });

    const comments = await client.listReviewComments('o', 'r', 5);
    expect(comments).toEqual([
      { reviewId: 10, path: 'a.ts', line: 12, body: 'fix' },
      { reviewId: 10, path: 'b.ts', line: 7, body: 'nit' },
      { reviewId: null, path: 'c.ts', line: null, body: 'orphan' },
    ]);
  });

  it('retries on 429 then succeeds', async () => {
    const { fetchImpl, urls } = scriptedFetch([
      res(429, 'slow down', { 'retry-after': '0' }),
      res(200, [{ number: 1, updated_at: '2026-01-01T00:00:00Z' }]),
    ]);
    const client = createFetchGitHubReviewClient({ token: 't', fetchImpl, sleep: noSleep });

    const pulls = await client.listPullNumbers('o', 'r');
    expect(pulls).toHaveLength(1);
    expect(urls).toHaveLength(2); // 1 retry
  });

  it('retries on 403 with x-ratelimit-remaining: 0', async () => {
    const { fetchImpl, urls } = scriptedFetch([
      res(403, 'rate limited', { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '0' }),
      res(200, []),
    ]);
    const client = createFetchGitHubReviewClient({ token: 't', fetchImpl, sleep: noSleep });

    await expect(client.listReviews('o', 'r', 1)).resolves.toEqual([]);
    expect(urls).toHaveLength(2);
  });

  it('does not retry on 404 and throws', async () => {
    const { fetchImpl, urls } = scriptedFetch([res(404, 'not found')]);
    const client = createFetchGitHubReviewClient({ token: 't', fetchImpl, sleep: noSleep });

    await expect(client.listReviews('o', 'r', 1)).rejects.toThrow(/404/);
    expect(urls).toHaveLength(1);
  });

  it('gives up after maxRetries and throws', async () => {
    const { fetchImpl, urls } = scriptedFetch([res(429, 'busy', { 'retry-after': '0' })]);
    const client = createFetchGitHubReviewClient({ token: 't', fetchImpl, sleep: noSleep, maxRetries: 2 });

    await expect(client.listReviews('o', 'r', 1)).rejects.toThrow(/429/);
    expect(urls).toHaveLength(3); // 初回 + 2 リトライ
  });

  it('throws when fetch is unavailable (no globalThis.fetch and no fetchImpl)', () => {
    // line 93: fetch unavailable guard
    const origFetch = (globalThis as Record<string, unknown>).fetch;
    (globalThis as Record<string, unknown>).fetch = undefined;
    try {
      expect(() =>
        createFetchGitHubReviewClient({ token: 't' }),
      ).toThrow(/fetch is unavailable/);
    } finally {
      if (origFetch !== undefined) {
        (globalThis as Record<string, unknown>).fetch = origFetch;
      } else {
        delete (globalThis as Record<string, unknown>).fetch;
      }
    }
  });

  it('warns when result count reaches per_page limit (100)', async () => {
    // line 212: warnIfTruncated fires a warn when count >= PER_PAGE (100)
    const warnLogs: string[] = [];
    const hundredReviews = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      user: { login: 'u' },
      state: 'APPROVED',
      submitted_at: '2026-01-01T00:00:00Z',
      body: 'ok',
    }));
    const { fetchImpl } = scriptedFetch([res(200, hundredReviews)]);
    const client = createFetchGitHubReviewClient({
      token: 't',
      fetchImpl,
      sleep: noSleep,
      logger: { warn: (m) => warnLogs.push(m) },
    });

    const reviews = await client.listReviews('o', 'r', 1);
    expect(reviews).toHaveLength(100);
    expect(warnLogs.some((l) => l.includes('per_page=100'))).toBe(true);
  });

  it('handles text() throwing in safeText during error response', async () => {
    // line 241: safeText catch { return '' }
    const failingTextRes: Response = {
      ok: false,
      status: 500,
      statusText: 'S500',
      headers: new Headers({}),
      json: async () => { throw new Error('no json'); },
      text: async () => { throw new Error('text failed'); },
    } as unknown as Response;

    const { fetchImpl } = scriptedFetch([failingTextRes]);
    const client = createFetchGitHubReviewClient({ token: 't', fetchImpl, sleep: noSleep });

    // Should throw with 500 status but not crash on text() failure
    await expect(client.listReviews('o', 'r', 1)).rejects.toThrow(/500/);
  });

  it('handles null/undefined fields in raw pull, review, and comment responses', async () => {
    // Covers lines 146 (updated_at ?? ''), 161 (user?.login null), 174-176 (comment fields)
    const { fetchImpl: f1 } = scriptedFetch([
      res(200, [
        { number: 1 }, // updated_at missing → updatedAt = ''
      ]),
    ]);
    const c1 = createFetchGitHubReviewClient({ token: 't', fetchImpl: f1, sleep: noSleep });
    const pulls = await c1.listPullNumbers('o', 'r', { since: '2026-01-01T00:00:00Z' });
    // updatedAt='' and since is set: condition is `since && updatedAt && updatedAt < since`
    // updatedAt='' is falsy, so the condition short-circuits and the pull is NOT filtered out
    expect(pulls).toEqual([{ number: 1, updatedAt: '' }]);

    // Pull with updatedAt empty and no since → included
    const { fetchImpl: f2 } = scriptedFetch([
      res(200, [{ number: 5 }]),
    ]);
    const c2 = createFetchGitHubReviewClient({ token: 't', fetchImpl: f2, sleep: noSleep });
    const pulls2 = await c2.listPullNumbers('o', 'r'); // no since
    expect(pulls2).toEqual([{ number: 5, updatedAt: '' }]);

    // Review with missing user, state, submitted_at, body
    const { fetchImpl: f3 } = scriptedFetch([
      res(200, [
        { id: 99, user: undefined, state: undefined, submitted_at: undefined, body: undefined },
      ]),
    ]);
    const c3 = createFetchGitHubReviewClient({ token: 't', fetchImpl: f3, sleep: noSleep });
    const reviews = await c3.listReviews('o', 'r', 1);
    expect(reviews[0]).toMatchObject({ id: 99, author: '', state: '', submittedAt: null, body: '' });

    // Comment with null body, null path, null line, null original_line
    const { fetchImpl: f4 } = scriptedFetch([
      res(200, [
        { pull_request_review_id: undefined, path: undefined, line: null, original_line: null, body: undefined },
      ]),
    ]);
    const c4 = createFetchGitHubReviewClient({ token: 't', fetchImpl: f4, sleep: noSleep });
    const comments = await c4.listReviewComments('o', 'r', 1);
    expect(comments[0]).toMatchObject({ reviewId: null, path: '', line: null, body: '' });
  });

  it('uses x-ratelimit-reset when retry-after is absent', async () => {
    // rateLimitWaitMs: x-ratelimit-reset branch
    const futureReset = Math.floor((Date.now() + 500) / 1000).toString();
    const { fetchImpl, urls } = scriptedFetch([
      res(429, 'slow', { 'x-ratelimit-reset': futureReset }),
      res(200, []),
    ]);
    const sleptMs: number[] = [];
    const client = createFetchGitHubReviewClient({
      token: 't',
      fetchImpl,
      sleep: async (ms) => { sleptMs.push(ms); },
      maxRetries: 1,
    });

    await client.listReviews('o', 'r', 1);
    expect(urls).toHaveLength(2);
    expect(sleptMs[0]).toBeGreaterThan(0);
  });

  it('falls back to 1000ms when x-ratelimit-reset is in the past (delta <= 0)', async () => {
    // line 230: delta <= 0 branch — reset time is past, so falls through to default 1000ms
    const pastReset = Math.floor((Date.now() - 10000) / 1000).toString(); // 10s in the past
    const { fetchImpl, urls } = scriptedFetch([
      res(429, 'slow', { 'x-ratelimit-reset': pastReset }),
      res(200, []),
    ]);
    const sleptMs: number[] = [];
    const client = createFetchGitHubReviewClient({
      token: 't',
      fetchImpl,
      sleep: async (ms) => { sleptMs.push(ms); },
      maxRetries: 1,
    });

    await client.listReviews('o', 'r', 1);
    expect(urls).toHaveLength(2);
    // delta <= 0, so falls through to default 1000ms
    expect(sleptMs[0]).toBe(1000);
  });

  it('defaults to 1000ms wait when no rate limit headers present', async () => {
    // rateLimitWaitMs: default 1000 branch
    const { fetchImpl, urls } = scriptedFetch([
      res(429, 'slow', {}),
      res(200, []),
    ]);
    const sleptMs: number[] = [];
    const client = createFetchGitHubReviewClient({
      token: 't',
      fetchImpl,
      sleep: async (ms) => { sleptMs.push(ms); },
      maxRetries: 1,
    });

    await client.listReviews('o', 'r', 1);
    expect(urls).toHaveLength(2);
    expect(sleptMs[0]).toBe(1000);
  });
});
