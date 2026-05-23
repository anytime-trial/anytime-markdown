/**
 * /api/code-graph/explain and /api/code-graph/query のユニットテスト
 */

const mockResolveSupabaseEnv = jest.fn();
const mockCreateClient = jest.fn();
const mockComposeCodeGraph = jest.fn();

jest.mock('../lib/supabase-env', () => ({
  resolveSupabaseEnv: mockResolveSupabaseEnv,
}));

jest.mock('../lib/api-helpers', () => ({
  NO_STORE_HEADERS: { 'Cache-Control': 'no-store' },
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));

jest.mock('@anytime-markdown/trail-core/codeGraph', () => ({
  composeCodeGraph: mockComposeCodeGraph,
}));

const MockNextResponse = class {
  _body: unknown;
  _status: number;
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

import { GET as explainGET } from '../app/api/code-graph/explain/route';
import { GET as queryGET } from '../app/api/code-graph/query/route';
import { GET as graphGET } from '../app/api/code-graph/route';

type MockResp = { _body: unknown; _status: number };

function makeRequest(params: Record<string, string> = {}): import('next/server').NextRequest {
  const sp = new URLSearchParams(params);
  return { nextUrl: { searchParams: sp } } as unknown as import('next/server').NextRequest;
}

function makeSupabase(graphJson: string | null, error?: boolean) {
  const supabase = {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'trail_current_code_graphs') {
        return {
          select: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: graphJson !== null ? { graph_json: graphJson } : null,
                error: error ? { message: 'db error' } : null,
              }),
            }),
          }),
        };
      }
      // communities
      return {
        select: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue({ data: [] }),
        }),
      };
    }),
  };
  return supabase;
}

const MOCK_GRAPH = {
  nodes: [
    { id: 'node1', label: 'FooBar', type: 'function', filePath: 'src/foo.ts', line: 10, community_id: 0 },
    { id: 'node2', label: 'BazQux', type: 'function', filePath: 'src/baz.ts', line: 20, community_id: 0 },
  ],
  edges: [
    { source: 'node1', target: 'node2', weight: 1 },
  ],
  communities: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockComposeCodeGraph.mockReturnValue(MOCK_GRAPH);
});

// ─────────────────────────────────────────────────────────
// /api/code-graph/explain
// ─────────────────────────────────────────────────────────
describe('GET /api/code-graph/explain', () => {
  it('returns 404 when supabase env is not configured', async () => {
    mockResolveSupabaseEnv.mockReturnValue(null);
    const req = makeRequest({ id: 'node1' });
    const result = (await explainGET(req)) as unknown as MockResp;
    expect(result._status).toBe(404);
  });

  it('returns 404 when graph fetch errors', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    const supabase = makeSupabase(null, true);
    mockCreateClient.mockReturnValue(supabase);

    const req = makeRequest({ id: 'node1' });
    const result = (await explainGET(req)) as unknown as MockResp;
    expect(result._status).toBe(404);
  });

  it('returns 404 when node id is not found in graph', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    const supabase = makeSupabase(JSON.stringify({ nodes: [], edges: [] }));
    mockCreateClient.mockReturnValue(supabase);

    const req = makeRequest({ id: 'nonexistent' });
    const result = (await explainGET(req)) as unknown as MockResp;
    expect(result._status).toBe(404);
  });

  it('returns node with incoming/outgoing edges on success', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    const supabase = makeSupabase(JSON.stringify({ nodes: MOCK_GRAPH.nodes, edges: MOCK_GRAPH.edges }));
    mockCreateClient.mockReturnValue(supabase);

    const req = makeRequest({ id: 'node1' });
    const result = (await explainGET(req)) as unknown as MockResp;
    expect(result._status).toBe(200);
    const body = result._body as Record<string, unknown>;
    expect((body.node as Record<string, unknown>).id).toBe('node1');
    expect(Array.isArray(body.incoming)).toBe(true);
    expect(Array.isArray(body.outgoing)).toBe(true);
  });

  it('returns 404 on thrown exception', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    mockCreateClient.mockImplementation(() => { throw new Error('crash'); });

    const req = makeRequest({ id: 'node1' });
    const result = (await explainGET(req)) as unknown as MockResp;
    expect(result._status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────
// /api/code-graph/query
// ─────────────────────────────────────────────────────────
describe('GET /api/code-graph/query', () => {
  it('returns 404 when supabase env is not configured', async () => {
    mockResolveSupabaseEnv.mockReturnValue(null);
    const req = makeRequest({ q: 'foo' });
    const result = (await queryGET(req)) as unknown as MockResp;
    expect(result._status).toBe(404);
  });

  it('returns matching nodes and edges on success', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    const supabase = makeSupabase(JSON.stringify({ nodes: MOCK_GRAPH.nodes, edges: MOCK_GRAPH.edges }));
    mockCreateClient.mockReturnValue(supabase);

    const req = makeRequest({ q: 'foo' }); // matches 'FooBar'
    const result = (await queryGET(req)) as unknown as MockResp;
    expect(result._status).toBe(200);
    const body = result._body as Record<string, unknown>;
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(Array.isArray(body.edges)).toBe(true);
  });

  it('returns 404 on thrown exception', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    mockCreateClient.mockImplementation(() => { throw new Error('crash'); });

    const req = makeRequest({ q: 'foo' });
    const result = (await queryGET(req)) as unknown as MockResp;
    expect(result._status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────
// /api/code-graph (current, per-repo フィルタ)
// コードグラフは repo 単位で個別保存されるため、current は repo_name で絞り込む。
// ─────────────────────────────────────────────────────────
function makeCurrentSupabase(graphJson: string | null) {
  const eqCalls: Array<[string, string, unknown]> = [];
  const from = jest.fn((table: string) => {
    if (table === 'trail_current_code_graphs') {
      const builder: Record<string, unknown> = {};
      builder.eq = jest.fn((col: string, val: unknown) => {
        eqCalls.push([table, col, val]);
        return builder;
      });
      builder.limit = jest.fn(() => ({
        single: jest.fn().mockResolvedValue({
          data: graphJson !== null ? { graph_json: graphJson } : null,
          error: null,
        }),
      }));
      return { select: jest.fn(() => builder) };
    }
    // trail_current_code_graph_communities
    const builder: Record<string, unknown> = {};
    builder.eq = jest.fn((col: string, val: unknown) => {
      eqCalls.push([table, col, val]);
      return builder;
    });
    builder.limit = jest.fn().mockResolvedValue({ data: [] });
    return { select: jest.fn(() => builder) };
  });
  return { client: { from }, eqCalls };
}

const VALID_STORED_GRAPH = JSON.stringify({
  generatedAt: '2026-05-23T00:00:00.000Z',
  repositories: [{ id: 'my-repo', label: 'my-repo', path: '/x' }],
  nodes: [],
  edges: [],
  godNodes: [],
});

describe('GET /api/code-graph (current, per-repo)', () => {
  it('repo 指定時は trail_current_code_graphs / communities を repo_name で絞り込む', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    const { client, eqCalls } = makeCurrentSupabase(VALID_STORED_GRAPH);
    mockCreateClient.mockReturnValue(client);

    const req = makeRequest({ repo: 'my-repo' });
    const result = (await graphGET(req)) as unknown as MockResp;

    expect(result._status).toBe(200);
    expect(eqCalls).toContainEqual(['trail_current_code_graphs', 'repo_name', 'my-repo']);
    expect(eqCalls).toContainEqual(['trail_current_code_graph_communities', 'repo_name', 'my-repo']);
  });

  it('repo 未指定時は eq 絞り込みせず先頭 1 件にフォールバックする', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    const { client, eqCalls } = makeCurrentSupabase(VALID_STORED_GRAPH);
    mockCreateClient.mockReturnValue(client);

    const req = makeRequest({});
    const result = (await graphGET(req)) as unknown as MockResp;

    expect(result._status).toBe(200);
    expect(eqCalls).toHaveLength(0);
  });

  it('グラフ未生成時は 404 を返す', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    const { client } = makeCurrentSupabase(null);
    mockCreateClient.mockReturnValue(client);

    const req = makeRequest({ repo: 'my-repo' });
    const result = (await graphGET(req)) as unknown as MockResp;
    expect(result._status).toBe(404);
  });
});
