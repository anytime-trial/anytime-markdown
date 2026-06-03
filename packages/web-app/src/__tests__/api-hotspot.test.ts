/**
 * /api/hotspot (GET) の characterization test
 */

export {}; // tsc -b: module 化して top-level 宣言の global 衝突(TS2451/TS2393)を防ぐ

const mockComputeFileHotspot = jest.fn();
const mockResolveSupabaseEnv = jest.fn();
const mockCreateClient = jest.fn();

jest.mock('@anytime-markdown/trail-core/c4', () => ({
  computeFileHotspot: mockComputeFileHotspot,
}));

jest.mock('../lib/supabase-env', () => ({
  resolveSupabaseEnv: mockResolveSupabaseEnv,
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));

jest.mock('next/server', () => {
  return {
    NextResponse: {
      json: jest.fn((body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 })),
    },
  };
});

jest.mock('../lib/api-helpers', () => ({ NO_STORE_HEADERS: {} }));

function makeRequest(params: Record<string, string>) {
  const url = new URL('http://localhost/api/hotspot');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { nextUrl: { searchParams: url.searchParams } } as any;
}

describe('GET /api/hotspot', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GET: (req: any) => Promise<any>;
  beforeAll(async () => {
    const mod = await import('../app/api/hotspot/route');
    GET = mod.GET;
  });
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 for invalid period', async () => {
    const res = await GET(makeRequest({ period: 'bad' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid granularity', async () => {
    const res = await GET(makeRequest({ granularity: 'bad' }));
    expect(res.status).toBe(400);
  });

  it('returns empty files when supabase env is not configured', async () => {
    mockResolveSupabaseEnv.mockReturnValue(null);
    const res = await GET(makeRequest({}));
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((res.body as any).files).toEqual([]);
  });

  it('returns computed files on success (commit granularity)', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'u', anonKey: 'k' });
    const mockFrom = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({ data: [], error: null }),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
    });
    mockCreateClient.mockReturnValue({ from: mockFrom });
    const fakeFiles = [{ filePath: 'a.ts', churn: 3, score: 1, rank: 1 }];
    mockComputeFileHotspot.mockReturnValue(fakeFiles);
    const res = await GET(makeRequest({ period: '7d', granularity: 'commit' }));
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((res.body as any).period).toBe('7d');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((res.body as any).granularity).toBe('commit');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((res.body as any).files).toEqual(fakeFiles);
  });
});
