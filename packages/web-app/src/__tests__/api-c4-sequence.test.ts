/**
 * /api/c4/sequence (GET) のユニットテスト
 *
 * このエンドポイントは AST 解析が不要なため常に空の SequenceModel を返す。
 */

const mockHeadersSet = jest.fn();
const MockNextResponse = class {
  _body: unknown;
  _status: number;
  headers = { set: mockHeadersSet };
  static json = jest.fn((body: unknown, init?: { status?: number }) => {
    const r = new MockNextResponse(body, init);
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

jest.mock('../lib/api-helpers', () => ({
  NO_STORE_HEADERS: { 'Cache-Control': 'no-store' },
}));

import { GET } from '../app/api/c4/sequence/route';

type MockResp = { _body: Record<string, unknown>; _status: number };

function makeRequest(urlStr: string): Request {
  return { url: urlStr } as unknown as Request;
  // nextUrl is accessed as request.nextUrl.searchParams.get(...)
  // We need to simulate it
}

// The route uses request.nextUrl.searchParams — simulate via URL parsing
function makeNextRequest(params: Record<string, string> = {}): { nextUrl: { searchParams: URLSearchParams } } {
  const sp = new URLSearchParams(params);
  return { nextUrl: { searchParams: sp } } as unknown as { nextUrl: { searchParams: URLSearchParams } };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/c4/sequence', () => {
  it('returns 400 when elementId is missing', async () => {
    const req = makeNextRequest();
    const result = (await GET(req as unknown as import('next/server').NextRequest)) as unknown as MockResp;
    expect(result._status).toBe(400);
    expect((result._body as Record<string, unknown>).error).toContain('elementId');
  });

  it('returns empty SequenceModel when elementId is provided', async () => {
    const req = makeNextRequest({ elementId: 'pkg_foo' });
    const result = (await GET(req as unknown as import('next/server').NextRequest)) as unknown as MockResp;
    expect(result._status).toBe(200);
    const body = result._body;
    expect(body.version).toBe(1);
    expect(body.rootElementId).toBe('pkg_foo');
    expect(body.participants).toEqual([]);
    expect(body.root).toEqual({ kind: 'sequence', steps: [] });
  });

  it('sets Cache-Control header', async () => {
    const req = makeNextRequest({ elementId: 'pkg_bar' });
    await GET(req as unknown as import('next/server').NextRequest);
    expect(mockHeadersSet).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });
});
