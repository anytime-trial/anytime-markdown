/**
 * /api/news/wsj (GET) のユニットテスト
 */

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: unknown, init?: { status?: number }) => ({ _body: body, _status: init?.status ?? 200 })),
  },
}));

jest.mock('../lib/api-helpers', () => ({
  extractErrorMessage: jest.fn((e: unknown) => (e instanceof Error ? e.message : 'Unknown error')),
}));

const SAMPLE_RSS = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title><![CDATA[Fed Raises Rates Again]]></title>
      <link>https://wsj.com/articles/fed-raises-rates</link>
      <description><![CDATA[The Federal Reserve raised rates by 25 basis points.]]></description>
      <pubDate>Mon, 19 May 2026 12:00:00 +0000</pubDate>
      <dc:creator>Jane Reporter</dc:creator>
    </item>
    <item>
      <title>Markets Rally</title>
      <link>https://wsj.com/articles/markets-rally</link>
      <description>Stocks surged on Friday.</description>
      <pubDate>Fri, 17 May 2026 15:00:00 +0000</pubDate>
    </item>
    <item>
      <title></title>
      <link>https://wsj.com/bad</link>
    </item>
  </channel>
</rss>`;

function makeFetchMock(xml: string, ok = true) {
  return jest.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 503,
    text: jest.fn().mockResolvedValue(xml),
  });
}

import { GET } from '../app/api/news/wsj/route';

type MockResponse = { _body: Record<string, unknown>; _status: number };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/news/wsj', () => {
  it('returns parsed articles from RSS feeds', async () => {
    global.fetch = makeFetchMock(SAMPLE_RSS);

    const result = (await GET()) as unknown as MockResponse;
    expect(result._status).toBe(200);
    const articles = result._body.articles as Record<string, unknown>[];
    expect(articles.length).toBeGreaterThan(0);
    // First article from CDATA title
    expect(articles[0].title).toBe('Fed Raises Rates Again');
    expect(articles[0].author).toBe('Jane Reporter');
    expect(articles[0].section).toBe('World'); // first feed
  });

  it('uses "WSJ Staff" when author is missing', async () => {
    global.fetch = makeFetchMock(SAMPLE_RSS);

    const result = (await GET()) as unknown as MockResponse;
    const articles = result._body.articles as Record<string, unknown>[];
    const marketsArticle = articles.find((a) => a.title === 'Markets Rally');
    expect(marketsArticle?.author).toBe('WSJ Staff');
  });

  it('limits to 3 articles across all feeds', async () => {
    const manyItemsRss = `<rss><channel>${
      Array.from({ length: 5 }, (_, i) =>
        `<item><title>Item ${i}</title><link>https://wsj.com/${i}</link></item>`,
      ).join('')
    }</channel></rss>`;
    global.fetch = makeFetchMock(manyItemsRss);

    const result = (await GET()) as unknown as MockResponse;
    const articles = result._body.articles as unknown[];
    expect(articles.length).toBeLessThanOrEqual(3);
  });

  it('skips items without title', async () => {
    global.fetch = makeFetchMock(SAMPLE_RSS);
    const result = (await GET()) as unknown as MockResponse;
    const articles = result._body.articles as Record<string, unknown>[];
    // The item with empty title should be skipped
    expect(articles.every((a) => a.title)).toBe(true);
  });

  it('handles failed RSS feed gracefully (partial results)', async () => {
    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      if (callCount++ === 0) {
        return Promise.resolve({ ok: false, status: 503 });
      }
      return Promise.resolve({
        ok: true,
        text: jest.fn().mockResolvedValue(SAMPLE_RSS),
      });
    });

    const result = (await GET()) as unknown as MockResponse;
    expect(result._status).toBe(200);
    // Should have articles from the second feed even if first fails
    const articles = result._body.articles as unknown[];
    expect(Array.isArray(articles)).toBe(true);
  });

  it('handles all feeds failing gracefully (returns empty articles)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    const result = (await GET()) as unknown as MockResponse;
    expect(result._status).toBe(200);
    // All feeds failed, allSettled won't throw but articles will be empty
    const articles = result._body.articles as unknown[];
    expect(articles).toEqual([]);
  });

  it('parses publishedAt as ISO string', async () => {
    global.fetch = makeFetchMock(SAMPLE_RSS);
    const result = (await GET()) as unknown as MockResponse;
    const articles = result._body.articles as Record<string, unknown>[];
    expect(articles[0].publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
