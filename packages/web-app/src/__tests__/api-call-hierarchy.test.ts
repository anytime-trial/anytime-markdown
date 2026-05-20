/**
 * /api/c4/call-hierarchy (GET) の characterization test
 * 外部依存 (supabase, trail-core) をすべてモックして境界値を検証する。
 */

const mockBuildIndex = jest.fn();
const mockTraverse = jest.fn();
const mockBuildNodeFilter = jest.fn();
const mockResolveSupabaseEnv = jest.fn();
const mockCreateClient = jest.fn();

jest.mock('@anytime-markdown/trail-core/c4/callHierarchy', () => ({
  buildIndex: mockBuildIndex,
  traverse: mockTraverse,
  buildCallHierarchyNodeFilter: mockBuildNodeFilter,
}));

jest.mock('../lib/supabase-env', () => ({
  resolveSupabaseEnv: mockResolveSupabaseEnv,
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));

jest.mock('next/server', () => {
  class MockNextRequest {
    nextUrl: URL;
    constructor(url: string) { this.nextUrl = new URL(url); }
  }
  return {
    NextResponse: {
      json: jest.fn((body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 })),
    },
    NextRequest: MockNextRequest,
  };
});

jest.mock('../lib/api-helpers', () => ({ NO_STORE_HEADERS: {} }));

function makeRequest(params: Record<string, string>) {
  const url = new URL('http://localhost/api/c4/call-hierarchy');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { nextUrl: { searchParams: url.searchParams } } as any;
}

describe('GET /api/c4/call-hierarchy', () => {
  // Dynamic import so mocks are applied first
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GET: (req: any) => Promise<any>;
  beforeAll(async () => {
    const mod = await import('../app/api/c4/call-hierarchy/route');
    GET = mod.GET;
  });
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when file is missing', async () => {
    const res = await GET(makeRequest({ fn: 'foo' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when fn is missing', async () => {
    const res = await GET(makeRequest({ file: 'a.ts' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid direction', async () => {
    const res = await GET(makeRequest({ file: 'a.ts', fn: 'foo', direction: 'invalid' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid scope', async () => {
    const res = await GET(makeRequest({ file: 'a.ts', fn: 'foo', scope: 'invalid' }));
    expect(res.status).toBe(400);
  });

  it('returns 503 when supabase env is not configured', async () => {
    mockResolveSupabaseEnv.mockReturnValue(null);
    const res = await GET(makeRequest({ file: 'a.ts', fn: 'foo' }));
    expect(res.status).toBe(503);
  });

  it('returns 503 when supabase returns error', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    const mockQuery = {
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: 'db error' }),
    };
    mockCreateClient.mockReturnValue({ from: jest.fn().mockReturnValue(mockQuery) });
    const res = await GET(makeRequest({ file: 'a.ts', fn: 'foo' }));
    expect(res.status).toBe(503);
  });

  it('returns 404 when function node not found in index', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    const mockQuery = {
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { graph_json: '{"nodes":[],"edges":[]}' }, error: null }),
    };
    mockCreateClient.mockReturnValue({ from: jest.fn().mockReturnValue(mockQuery) });
    mockBuildIndex.mockReturnValue({ nodes: new Map() });
    mockBuildNodeFilter.mockReturnValue(null);
    const res = await GET(makeRequest({ file: 'a.ts', fn: 'foo' }));
    expect(res.status).toBe(404);
  });

  it('returns tree when function is found', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    const graphJson = JSON.stringify({ nodes: [], edges: [] });
    const mockQuery = {
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { graph_json: graphJson }, error: null }),
    };
    mockCreateClient.mockReturnValue({ from: jest.fn().mockReturnValue(mockQuery) });
    const node = { type: 'function', filePath: 'a.ts', label: 'foo', id: 'n1', line: 1 };
    mockBuildIndex.mockReturnValue({ nodes: new Map([['n1', node]]) });
    mockBuildNodeFilter.mockReturnValue(null);
    const fakeTree = { id: 'n1', children: [] };
    mockTraverse.mockReturnValue(fakeTree);
    const res = await GET(makeRequest({ file: 'a.ts', fn: 'foo' }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(fakeTree);
  });
});
