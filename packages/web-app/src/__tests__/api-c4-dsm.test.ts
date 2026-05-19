/**
 * /api/c4/dsm (GET) のユニットテスト
 */

const mockCreateC4ModelStore = jest.fn();
const mockBuildSourceMatrix = jest.fn();

jest.mock('../lib/api-helpers', () => ({
  createC4ModelStore: mockCreateC4ModelStore,
  NO_STORE_HEADERS: { 'Cache-Control': 'no-store' },
}));

jest.mock('@anytime-markdown/trail-core/c4', () => ({
  buildSourceMatrix: mockBuildSourceMatrix,
}));

const MockNextResponse = class {
  _body: unknown;
  _status: number;
  headers = { set: jest.fn() };
  static json = jest.fn((body: unknown, init?: { headers?: Record<string, string> }) => {
    const r = new MockNextResponse(body, {});
    r._headers = init?.headers ?? {};
    return r;
  });
  _headers: Record<string, string> = {};
  constructor(body: unknown, init?: { status?: number }) {
    this._body = body;
    this._status = init?.status ?? 200;
  }
};

jest.mock('next/server', () => ({
  NextResponse: MockNextResponse,
}));

import { GET } from '../app/api/c4/dsm/route';

type MockResp = { _body: unknown; _status: number };

function makeRequest(params: Record<string, string> = {}): import('next/server').NextRequest {
  const sp = new URLSearchParams(params);
  return { nextUrl: { searchParams: sp } } as unknown as import('next/server').NextRequest;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/c4/dsm', () => {
  it('returns 204 when store is not available', async () => {
    mockCreateC4ModelStore.mockReturnValue(null);
    const req = makeRequest({ repo: 'my-repo' });
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(204);
  });

  it('returns 204 when graph is null for current release', async () => {
    const store = { getCurrentGraph: jest.fn().mockResolvedValue(null) };
    mockCreateC4ModelStore.mockReturnValue(store);
    const req = makeRequest({ release: 'current', repo: 'my-repo' });
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(204);
  });

  it('returns 204 when graph.graph is null', async () => {
    const store = { getCurrentGraph: jest.fn().mockResolvedValue({ graph: null }) };
    mockCreateC4ModelStore.mockReturnValue(store);
    const req = makeRequest({ release: 'current', repo: 'my-repo' });
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(204);
  });

  it('returns matrix for current release', async () => {
    const mockGraph = { nodes: [], edges: [] };
    const store = { getCurrentGraph: jest.fn().mockResolvedValue({ graph: mockGraph }) };
    mockCreateC4ModelStore.mockReturnValue(store);
    const mockMatrix = { rows: [], cols: [] };
    mockBuildSourceMatrix.mockReturnValue(mockMatrix);

    const req = makeRequest({ release: 'current', repo: 'my-repo' });
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(200);
    expect((result._body as Record<string, unknown>).matrix).toBe(mockMatrix);
    expect(mockBuildSourceMatrix).toHaveBeenCalledWith(mockGraph, 'component');
  });

  it('returns matrix for a specific release tag', async () => {
    const mockGraph = { nodes: [], edges: [] };
    const store = { getReleaseGraph: jest.fn().mockResolvedValue(mockGraph) };
    mockCreateC4ModelStore.mockReturnValue(store);
    const mockMatrix = { rows: [], cols: [] };
    mockBuildSourceMatrix.mockReturnValue(mockMatrix);

    const req = makeRequest({ release: 'v1.0.0', repo: 'my-repo' });
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(200);
    expect(store.getReleaseGraph).toHaveBeenCalledWith('v1.0.0');
  });

  it('returns 204 on error', async () => {
    const store = { getCurrentGraph: jest.fn().mockRejectedValue(new Error('db error')) };
    mockCreateC4ModelStore.mockReturnValue(store);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const req = makeRequest({ repo: 'my-repo' });
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(204);
    consoleSpy.mockRestore();
  });
});
