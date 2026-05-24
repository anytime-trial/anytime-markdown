/**
 * /api/c4/model (GET) のユニットテスト
 */

const mockCreateC4ModelStore = jest.fn();
const mockResolveSupabaseEnv = jest.fn();
const mockFetchC4Model = jest.fn();
const mockBuildFeatureMatrixFromCommunities = jest.fn();
const mockMergeManualIntoC4Model = jest.fn();
const mockCreateClient = jest.fn();

jest.mock('../lib/api-helpers', () => ({
  createC4ModelStore: mockCreateC4ModelStore,
  NO_STORE_HEADERS: { 'Cache-Control': 'no-store' },
  resolveRepoId: jest.fn().mockResolvedValue(1),
}));

jest.mock('../lib/supabase-env', () => ({
  resolveSupabaseEnv: mockResolveSupabaseEnv,
}));

jest.mock('@anytime-markdown/trail-core/c4', () => ({
  fetchC4Model: mockFetchC4Model,
  buildFeatureMatrixFromCommunities: mockBuildFeatureMatrixFromCommunities,
  mergeManualIntoC4Model: mockMergeManualIntoC4Model,
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
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

import { GET } from '../app/api/c4/model/route';

type MockResp = { _body: unknown; _status: number };

function makeRequest(params: Record<string, string> = {}): import('next/server').NextRequest {
  const sp = new URLSearchParams(params);
  return { nextUrl: { searchParams: sp } } as unknown as import('next/server').NextRequest;
}

function makeSupabaseMock(data: { elements: unknown[]; rels: unknown[]; communities: unknown[] }) {
  const fromMock = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ data: data.elements }),
    }),
  });
  const supabaseMock = {
    from: fromMock,
  };
  // Needs to handle 3 parallel calls, each with different table
  let callCount = 0;
  supabaseMock.from = jest.fn().mockImplementation((table: string) => {
    const idx = callCount++;
    const tableData = [data.elements, data.rels, data.communities][idx] ?? [];
    return {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: tableData }),
      }),
    };
  });
  return supabaseMock;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/c4/model', () => {
  it('returns 204 when store is not available', async () => {
    mockCreateC4ModelStore.mockReturnValue(null);
    const req = makeRequest();
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(204);
  });

  it('returns 204 when fetchC4Model returns null', async () => {
    mockCreateC4ModelStore.mockReturnValue({});
    mockFetchC4Model.mockResolvedValue(null);
    const req = makeRequest({ release: 'current' });
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(204);
  });

  it('returns payload directly when no repo+current release', async () => {
    mockCreateC4ModelStore.mockReturnValue({});
    const payload = { model: { elements: [], relationships: [] } };
    mockFetchC4Model.mockResolvedValue(payload);

    const req = makeRequest({ release: 'v1.0.0' }); // not current
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(200);
    expect(result._body).toBe(payload);
  });

  it('returns payload directly when release=current but no repo', async () => {
    mockCreateC4ModelStore.mockReturnValue({});
    const payload = { model: { elements: [], relationships: [] } };
    mockFetchC4Model.mockResolvedValue(payload);

    const req = makeRequest({ release: 'current' }); // no repo
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(200);
    expect(result._body).toBe(payload);
  });

  it('returns merged payload when repo+release=current+env configured', async () => {
    const store = {};
    mockCreateC4ModelStore.mockReturnValue(store);
    mockResolveSupabaseEnv.mockReturnValue({ url: 'https://x.co', anonKey: 'k' });

    const originalModel = { elements: [], relationships: [] };
    const mergedModel = { elements: [{ id: 'manual_1' }], relationships: [] };
    const payload = { model: originalModel };
    mockFetchC4Model.mockResolvedValue(payload);
    mockMergeManualIntoC4Model.mockReturnValue(mergedModel);
    mockBuildFeatureMatrixFromCommunities.mockReturnValue(null);

    const supabaseMock = makeSupabaseMock({ elements: [], rels: [], communities: [] });
    mockCreateClient.mockReturnValue(supabaseMock);

    const req = makeRequest({ release: 'current', repo: 'my-repo' });
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(200);
    const body = result._body as Record<string, unknown>;
    expect(body.model).toBe(mergedModel);
  });

  it('includes featureMatrix in response when communities are present', async () => {
    const store = {};
    mockCreateC4ModelStore.mockReturnValue(store);
    mockResolveSupabaseEnv.mockReturnValue({ url: 'https://x.co', anonKey: 'k' });

    const payload = { model: { elements: [], relationships: [] } };
    mockFetchC4Model.mockResolvedValue(payload);
    mockMergeManualIntoC4Model.mockReturnValue(payload.model);
    const featureMatrix = { features: [] };
    mockBuildFeatureMatrixFromCommunities.mockReturnValue(featureMatrix);

    const supabaseMock = makeSupabaseMock({
      elements: [],
      rels: [],
      communities: [{ community_id: 1, name: 'c1', label: 'C1', mappings_json: null }],
    });
    mockCreateClient.mockReturnValue(supabaseMock);

    const req = makeRequest({ release: 'current', repo: 'my-repo' });
    const result = (await GET(req)) as unknown as MockResp;
    expect((result._body as Record<string, unknown>).featureMatrix).toBe(featureMatrix);
  });

  it('returns 204 on error', async () => {
    mockCreateC4ModelStore.mockReturnValue({});
    mockFetchC4Model.mockRejectedValue(new Error('db error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const req = makeRequest({ release: 'current', repo: 'my-repo' });
    const result = (await GET(req)) as unknown as MockResp;
    expect(result._status).toBe(204);
    consoleSpy.mockRestore();
  });
});
