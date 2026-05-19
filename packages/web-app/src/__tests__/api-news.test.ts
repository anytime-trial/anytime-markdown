/**
 * /api/news (GET) のユニットテスト
 */

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: unknown, init?: { status?: number }) => ({ _body: body, _status: init?.status ?? 200 })),
  },
}));

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
  delete process.env.GUARDIAN_API_KEY;
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

function makeGuardianResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'world/2026/may/19/test',
    type: 'article',
    sectionId: 'world',
    sectionName: 'World',
    webPublicationDate: '2026-05-19T12:00:00Z',
    webTitle: 'Test Article',
    webUrl: 'https://theguardian.com/world/2026/test',
    fields: { trailText: 'A test article.', byline: 'Jane Doe' },
    ...overrides,
  };
}

import { GET } from '../app/api/news/route';

type MockResponse = { _body: Record<string, unknown>; _status: number };

describe('GET /api/news', () => {
  it('returns articles on success', async () => {
    const result1 = makeGuardianResult();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        response: { status: 'ok', results: [result1] },
      }),
    });

    const result = (await GET()) as unknown as MockResponse;
    expect(result._body.articles).toHaveLength(1);
    expect((result._body.articles as Record<string, unknown>[])[0]).toMatchObject({
      title: 'Test Article',
      source: 'The Guardian',
      author: 'Jane Doe',
    });
  });

  it('filters results without trailText', async () => {
    const withText = makeGuardianResult({ fields: { trailText: 'Has text', byline: 'Author' } });
    const withoutText = makeGuardianResult({ id: 'other/id', fields: {} });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        response: { status: 'ok', results: [withText, withoutText] },
      }),
    });

    const result = (await GET()) as unknown as MockResponse;
    expect(result._body.articles).toHaveLength(1);
  });

  it('limits to 3 articles', async () => {
    const articles = Array.from({ length: 5 }, (_, i) =>
      makeGuardianResult({ id: `a/${i}`, fields: { trailText: `text ${i}` } }),
    );
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        response: { status: 'ok', results: articles },
      }),
    });

    const result = (await GET()) as unknown as MockResponse;
    expect(result._body.articles).toHaveLength(3);
  });

  it('uses "Guardian staff" when byline is missing', async () => {
    const article = makeGuardianResult({ fields: { trailText: 'text' } });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        response: { status: 'ok', results: [article] },
      }),
    });

    const result = (await GET()) as unknown as MockResponse;
    const mapped = (result._body.articles as Record<string, unknown>[])[0];
    expect(mapped.author).toBe('Guardian staff');
  });

  it('returns 502 when Guardian API returns non-ok status', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });

    const result = (await GET()) as unknown as MockResponse;
    expect(result._status).toBe(502);
  });

  it('returns 500 and error message when fetch throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network failure'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = (await GET()) as unknown as MockResponse;
    expect(result._status).toBe(500);
    expect(result._body.error).toBe('network failure');
    consoleSpy.mockRestore();
  });
});
