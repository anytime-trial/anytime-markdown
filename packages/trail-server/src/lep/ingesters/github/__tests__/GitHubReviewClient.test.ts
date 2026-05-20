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
});
