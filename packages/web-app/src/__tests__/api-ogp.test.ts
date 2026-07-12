/**
 * /api/ogp (GET) のユニットテスト
 */

const mockAssertSafeUrl = jest.fn();
const mockSafeFetch = jest.fn();
const mockParseOgpHtml = jest.fn();

jest.mock('../lib/ssrfGuard', () => ({
  assertSafeUrl: mockAssertSafeUrl,
  safeFetch: mockSafeFetch,
}));

jest.mock('../lib/ogpParser', () => ({
  parseOgpHtml: mockParseOgpHtml,
}));

const MockNextResponse = class {
  _body: unknown;
  _status: number;
  headers = { set: jest.fn() };
  static json = jest.fn((body: unknown) => {
    const r = new MockNextResponse(body, { status: 200 });
    return r;
  });
  constructor(body: unknown, init?: { status?: number }) {
    this._body = body;
    this._status = init?.status ?? 200;
  }
};

jest.mock('next/server', () => ({
  NextResponse: MockNextResponse,
}));

import { GET } from '../app/api/ogp/route';

type MockResp = { _body: unknown; _status: number };

function makeRequest(url: string): Request {
  return { url } as unknown as Request;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAssertSafeUrl.mockResolvedValue(undefined); // safe by default
  mockSafeFetch.mockImplementation((url: string, init?: RequestInit) => global.fetch(url, init));
  mockParseOgpHtml.mockReturnValue({ title: 'Test Page', description: 'A page' });
});

describe('GET /api/ogp', () => {
  it('returns 400 when url param is missing', async () => {
    const req = makeRequest('http://localhost/api/ogp');
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(400);
    expect(result._body).toBe('missing url');
  });

  it('returns 400 when assertSafeUrl rejects', async () => {
    mockAssertSafeUrl.mockRejectedValue(new Error('private IP'));
    const req = makeRequest('http://localhost/api/ogp?url=' + encodeURIComponent('http://169.254.169.254/'));
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(400);
    expect(String(result._body)).toContain('private IP');
  });

  it('returns 502 when upstream returns non-ok status', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    const req = makeRequest('http://localhost/api/ogp?url=' + encodeURIComponent('https://example.com/'));
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(502);
  });

  it('returns 415 when content-type is not html', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: jest.fn().mockReturnValue('application/json') },
      body: null,
    });
    const req = makeRequest('http://localhost/api/ogp?url=' + encodeURIComponent('https://example.com/'));
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(415);
  });

  it('returns 502 when body is null', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: jest.fn().mockReturnValue('text/html') },
      body: null,
    });
    const req = makeRequest('http://localhost/api/ogp?url=' + encodeURIComponent('https://example.com/'));
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(502);
  });

  // NOTE: The success path (streaming body via ReadableStream.getReader()) cannot be tested
  // in jsdom environment because jsdom does not support the ReadableStream/getReader API
  // that the route relies on. Error paths above cover the important branches.

  it('returns 504 on AbortError', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValue(abortErr);
    const req = makeRequest('http://localhost/api/ogp?url=' + encodeURIComponent('https://example.com/'));
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(504);
    expect(result._body).toBe('timeout');
  });

  it('returns 502 on other fetch errors', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error'));
    const req = makeRequest('http://localhost/api/ogp?url=' + encodeURIComponent('https://example.com/'));
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(502);
    expect(result._body).toBe('fetch-failed');
  });
});
