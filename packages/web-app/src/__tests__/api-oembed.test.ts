/**
 * /api/oembed (GET) のユニットテスト
 */

// Mock sanitizeTweetHtml to pass through
jest.mock('@anytime-markdown/markdown-core/src/utils/tweetSanitize', () => ({
  sanitizeTweetHtml: jest.fn((html: string) => `sanitized:${html}`),
}), { virtual: true });

const MockNextResponse = class {
  _body: unknown;
  _status: number;
  headers = { set: jest.fn() };
  static json = jest.fn((body: unknown) => new MockNextResponse(JSON.stringify(body), {}));
  constructor(body: unknown, init?: { status?: number }) {
    this._body = body;
    this._status = init?.status ?? 200;
  }
};
// Expose json as a static that creates instances
MockNextResponse.json = jest.fn((body: unknown) => {
  const r = new MockNextResponse(body, { status: 200 });
  return r;
});

jest.mock('next/server', () => ({
  NextResponse: MockNextResponse,
}));

import { GET } from '../app/api/oembed/route';

type MockResp = { _body: unknown; _status: number };

/** Minimal Request stub that parses a URL */
function makeRequest(urlStr: string): Request {
  return {
    url: urlStr,
  } as unknown as Request;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/oembed', () => {
  it('returns 400 when url param is missing', async () => {
    const req = makeRequest('http://localhost/api/oembed');
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(400);
    expect(result._body).toBe('missing url');
  });

  it('returns 400 for invalid URL', async () => {
    const req = makeRequest('http://localhost/api/oembed?url=not-a-url');
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(400);
    expect(result._body).toBe('invalid url');
  });

  it('returns 400 for non-http/https protocol', async () => {
    const req = makeRequest('http://localhost/api/oembed?url=' + encodeURIComponent('ftp://twitter.com/status/1'));
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(400);
    expect(result._body).toBe('rejected: scheme');
  });

  it('returns 400 for non-Twitter host', async () => {
    const req = makeRequest('http://localhost/api/oembed?url=' + encodeURIComponent('https://instagram.com/p/123'));
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(400);
    expect(result._body).toBe('rejected: host');
  });

  it('returns 502 when upstream returns non-ok status', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    const req = makeRequest('http://localhost/api/oembed?url=' + encodeURIComponent('https://twitter.com/user/status/123'));
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(502);
  });

  it('returns 502 when upstream response has no html field', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ author_name: 'Alice' }),
    });
    const req = makeRequest('http://localhost/api/oembed?url=' + encodeURIComponent('https://twitter.com/user/status/123'));
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(502);
  });

  it('returns sanitized oembed payload on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        html: '<blockquote>tweet</blockquote>',
        author_name: 'Alice',
      }),
    });
    const req = makeRequest('http://localhost/api/oembed?url=' + encodeURIComponent('https://twitter.com/user/status/123'));
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(200);
    const body = result._body as Record<string, unknown>;
    expect(body.provider).toBe('twitter');
    expect(body.html).toContain('sanitized:');
    expect(body.authorName).toBe('Alice');
  });

  it('accepts x.com host', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        html: '<blockquote>tweet</blockquote>',
        author_name: null,
      }),
    });
    const req = makeRequest('http://localhost/api/oembed?url=' + encodeURIComponent('https://x.com/user/status/456'));
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(200);
    const body = result._body as Record<string, unknown>;
    expect(body.authorName).toBeNull();
  });

  it('returns 504 on fetch timeout (AbortError)', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValue(abortErr);
    const req = makeRequest('http://localhost/api/oembed?url=' + encodeURIComponent('https://twitter.com/user/status/789'));
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(504);
    expect(result._body).toBe('timeout');
  });

  it('returns 502 on other fetch errors', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error'));
    const req = makeRequest('http://localhost/api/oembed?url=' + encodeURIComponent('https://twitter.com/user/status/789'));
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(502);
    expect(result._body).toBe('fetch-failed');
  });
});
