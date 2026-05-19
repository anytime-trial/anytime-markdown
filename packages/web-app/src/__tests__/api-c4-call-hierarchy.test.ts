/**
 * /api/c4/call-hierarchy (GET) のユニットテスト
 */

const mockResolveSupabaseEnv = jest.fn();
const mockCreateClient = jest.fn();
const mockBuildCallHierarchyIndex = jest.fn();
const mockTraverseCallHierarchy = jest.fn();
const mockBuildCallHierarchyNodeFilter = jest.fn();

jest.mock('../lib/api-helpers', () => ({
  NO_STORE_HEADERS: { 'Cache-Control': 'no-store' },
}));

jest.mock('../lib/supabase-env', () => ({
  resolveSupabaseEnv: mockResolveSupabaseEnv,
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));

jest.mock('@anytime-markdown/trail-core/c4/callHierarchy', () => ({
  buildCallHierarchyNodeFilter: mockBuildCallHierarchyNodeFilter,
  buildIndex: mockBuildCallHierarchyIndex,
  traverse: mockTraverseCallHierarchy,
}));

const MockNextResponse = class {
  _body: unknown;
  _status: number;
  _headers: Record<string, string> = {};
  static json = jest.fn((body: unknown, init?: { status?: number; headers?: Record<string, string> }) => {
    const r = new MockNextResponse(body, init);
    r._headers = init?.headers ?? {};
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

import { GET } from '../app/api/c4/call-hierarchy/route';

type MockResp = { _body: Record<string, unknown>; _status: number };

function makeRequest(params: Record<string, string> = {}): import('next/server').NextRequest {
  const sp = new URLSearchParams(params);
  return { nextUrl: { searchParams: sp } } as unknown as import('next/server').NextRequest;
}

function makeSupabaseMock(graphJson: string | null, error?: boolean) {
  const chainResult = {
    maybeSingle: jest.fn().mockResolvedValue({
      data: graphJson !== null ? { graph_json: graphJson } : null,
      error: error ? { message: 'db error' } : null,
    }),
    eq: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
  };
  return {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue(chainResult),
    }),
  };
}

const MOCK_GRAPH = {
  nodes: [
    { id: 'n1', label: 'doSomething', type: 'function', filePath: 'src/foo.ts', line: 10 },
    { id: 'n2', label: 'helper', type: 'function', filePath: 'src/bar.ts', line: 5 },
  ],
  edges: [{ source: 'n1', target: 'n2', weight: 1 }],
};

const MOCK_TREE = { id: 'n1', children: [{ id: 'n2', children: [] }] };

beforeEach(() => {
  jest.clearAllMocks();
  mockBuildCallHierarchyIndex.mockReturnValue({
    nodes: new Map([
      ['n1', MOCK_GRAPH.nodes[0]],
      ['n2', MOCK_GRAPH.nodes[1]],
    ]),
  });
  mockBuildCallHierarchyNodeFilter.mockReturnValue(null);
  mockTraverseCallHierarchy.mockReturnValue(MOCK_TREE);
});

describe('GET /api/c4/call-hierarchy', () => {
  it('returns 400 when file or fn is missing', async () => {
    const req = makeRequest({ fn: 'doSomething' }); // missing file
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(400);
    expect(result._body.error).toContain('file');
  });

  it('returns 400 when fn is missing', async () => {
    const req = makeRequest({ file: 'src/foo.ts' }); // missing fn
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(400);
  });

  it('returns 400 for invalid direction', async () => {
    const req = makeRequest({ file: 'src/foo.ts', fn: 'doSomething', direction: 'invalid' });
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(400);
    expect(result._body.error).toContain('direction');
  });

  it('returns 400 for invalid scope', async () => {
    const req = makeRequest({ file: 'src/foo.ts', fn: 'doSomething', scope: 'module' });
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(400);
    expect(result._body.error).toContain('scope');
  });

  it('returns 503 when supabase env is not configured', async () => {
    mockResolveSupabaseEnv.mockReturnValue(null);
    const req = makeRequest({ file: 'src/foo.ts', fn: 'doSomething' });
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(503);
  });

  it('returns 503 when graph fetch errors', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    const supabase = makeSupabaseMock(null, true);
    mockCreateClient.mockReturnValue(supabase);

    const req = makeRequest({ file: 'src/foo.ts', fn: 'doSomething' });
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(503);
  });

  it('returns 503 when no graph data found', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    const supabase = makeSupabaseMock(null);
    mockCreateClient.mockReturnValue(supabase);

    const req = makeRequest({ file: 'src/foo.ts', fn: 'doSomething' });
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(503);
  });

  it('returns 404 when function is not found in graph', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    const supabase = makeSupabaseMock(JSON.stringify(MOCK_GRAPH));
    mockCreateClient.mockReturnValue(supabase);

    const req = makeRequest({ file: 'src/foo.ts', fn: 'nonexistent' });
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(404);
    expect(result._body.error).toContain('not found');
  });

  it('returns 404 when traverse returns null', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    const supabase = makeSupabaseMock(JSON.stringify(MOCK_GRAPH));
    mockCreateClient.mockReturnValue(supabase);
    mockTraverseCallHierarchy.mockReturnValue(null);

    const req = makeRequest({ file: 'src/foo.ts', fn: 'doSomething' });
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(404);
    expect(result._body.error).toContain('not in index');
  });

  it('returns call hierarchy tree on success', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    const supabase = makeSupabaseMock(JSON.stringify(MOCK_GRAPH));
    mockCreateClient.mockReturnValue(supabase);

    const req = makeRequest({ file: 'src/foo.ts', fn: 'doSomething', direction: 'callees' });
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(200);
    expect(result._body).toEqual(MOCK_TREE);
  });

  it('accepts callers direction', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    const supabase = makeSupabaseMock(JSON.stringify(MOCK_GRAPH));
    mockCreateClient.mockReturnValue(supabase);

    const req = makeRequest({
      file: 'src/foo.ts',
      fn: 'doSomething',
      direction: 'callers',
      depth: '3',
    });
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(200);
    const call = mockTraverseCallHierarchy.mock.calls[0];
    expect(call[1]).toBe('n1');
    expect(call[2]).toBe('callers');
    expect(call[3]).toBe(3);
  });

  it('clamps depth values', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    const supabase = makeSupabaseMock(JSON.stringify(MOCK_GRAPH));
    mockCreateClient.mockReturnValue(supabase);

    const req = makeRequest({ file: 'src/foo.ts', fn: 'doSomething', depth: '999' });
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(200);
    // depth clamped to 10
    const call = mockTraverseCallHierarchy.mock.calls[0];
    expect(call[2]).toBe('callees');
    expect(call[3]).toBe(10);
  });

  it('returns 500 on thrown exception', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    mockCreateClient.mockImplementation(() => { throw new Error('crash'); });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const req = makeRequest({ file: 'src/foo.ts', fn: 'doSomething' });
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(500);
    consoleSpy.mockRestore();
  });

  it('uses line number to match specific function overload', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    // Add two nodes with same label but different lines
    const graphWithDupe = {
      nodes: [
        { id: 'n1a', label: 'doSomething', type: 'function', filePath: 'src/foo.ts', line: 10 },
        { id: 'n1b', label: 'doSomething', type: 'function', filePath: 'src/foo.ts', line: 20 },
      ],
      edges: [],
    };
    mockBuildCallHierarchyIndex.mockReturnValue({
      nodes: new Map([
        ['n1a', graphWithDupe.nodes[0]],
        ['n1b', graphWithDupe.nodes[1]],
      ]),
    });
    const supabase = makeSupabaseMock(JSON.stringify(graphWithDupe));
    mockCreateClient.mockReturnValue(supabase);

    const req = makeRequest({ file: 'src/foo.ts', fn: 'doSomething', line: '20' });
    await GET(req);
    const call = mockTraverseCallHierarchy.mock.calls[0];
    expect(call[1]).toBe('n1b');
  });
});
