/**
 * /api/temporal-coupling (GET) のユニットテスト
 *
 * granularity / directional の組み合わせによる計算関数の選択、パラメータのクランプ、
 * 拡張機能と同一のパスフィルタ（ロックファイル・生成物の除外）、
 * Supabase 未設定・0 件・例外時の空応答を固定する。
 */

const mockCreateClient = jest.fn();
const mockResolveSupabaseEnv = jest.fn();
const mockComputeTemporalCoupling = jest.fn();
const mockComputeConfidenceCoupling = jest.fn();
const mockComputeSessionCoupling = jest.fn();
const mockComputeSessionConfidenceCoupling = jest.fn();

jest.mock('@supabase/supabase-js', () => ({ createClient: mockCreateClient }));
jest.mock('../lib/supabase-env', () => ({ resolveSupabaseEnv: mockResolveSupabaseEnv }));
jest.mock('../lib/api-helpers', () => ({ NO_STORE_HEADERS: { 'Cache-Control': 'no-store' } }));
jest.mock('@anytime-markdown/trail-activity', () => ({
  computeTemporalCoupling: mockComputeTemporalCoupling,
  computeConfidenceCoupling: mockComputeConfidenceCoupling,
  computeSessionCoupling: mockComputeSessionCoupling,
  computeSessionConfidenceCoupling: mockComputeSessionConfidenceCoupling,
}));

type MockResp = { _body: Record<string, unknown>; _headers: Record<string, string> };

class MockNextResponse {
  static json = jest.fn(
    (body: unknown, init?: { headers?: Record<string, string> }) =>
      ({ _body: body, _headers: init?.headers ?? {} }) as MockResp,
  );
}
jest.mock('next/server', () => ({ NextResponse: MockNextResponse }));

import { GET } from '../app/api/temporal-coupling/route';

function makeSupabase(batches: Record<string, Array<{ data?: unknown[]; error?: unknown }>>) {
  return {
    from(table: string) {
      const queued = batches[table] ?? [];
      const chain = {
        select: () => chain,
        gte: () => chain,
        order: () => chain,
        range: () => Promise.resolve(queued.shift() ?? { data: [], error: null }),
      };
      return chain;
    },
  };
}

function makeRequest(params: Record<string, string> = {}): import('next/server').NextRequest {
  return {
    nextUrl: { searchParams: new URLSearchParams(params) },
  } as unknown as import('next/server').NextRequest;
}

const call = async (params: Record<string, string> = {}): Promise<MockResp> =>
  (await GET(makeRequest(params))) as unknown as MockResp;

/** commit → file の 1 対 1 データで Supabase を組む。 */
function supabaseWith(files: Array<{ commit_hash: string; file_path: string }>, sessionOf: Record<string, string>) {
  return makeSupabase({
    trail_session_commits: [
      {
        data: Object.entries(sessionOf).map(([commit_hash, session_id]) => ({
          commit_hash,
          session_id,
          committed_at: '2026-01-01T00:00:00Z',
        })),
      },
    ],
    trail_commit_files: [{ data: files }],
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveSupabaseEnv.mockReturnValue({ url: 'https://x.supabase.co', anonKey: 'anon' });
  for (const m of [
    mockComputeTemporalCoupling,
    mockComputeConfidenceCoupling,
    mockComputeSessionCoupling,
    mockComputeSessionConfidenceCoupling,
  ]) {
    m.mockReturnValue([]);
  }
});

describe('GET /api/temporal-coupling — granularity と directional の組み合わせ', () => {
  const files = [
    { commit_hash: 'h1', file_path: 'src/a.ts' },
    { commit_hash: 'h1', file_path: 'src/b.ts' },
  ];
  const sessions = { h1: 's1' };

  it('granularity=subagentType は Supabase を触らず空配列（データ源が無い）', async () => {
    const res = await call({ granularity: 'subagentType', directional: 'true' });
    expect(res._body).toMatchObject({ granularity: 'subagentType', edges: [], totalPairs: 0, directional: true });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('既定（commit / 非 directional）は computeTemporalCoupling を使う', async () => {
    mockCreateClient.mockReturnValue(supabaseWith(files, sessions));
    await call();
    expect(mockComputeTemporalCoupling).toHaveBeenCalledTimes(1);
    expect(mockComputeConfidenceCoupling).not.toHaveBeenCalled();
  });

  it('commit + directional は computeConfidenceCoupling を使う', async () => {
    mockCreateClient.mockReturnValue(supabaseWith(files, sessions));
    await call({ directional: 'true' });
    expect(mockComputeConfidenceCoupling).toHaveBeenCalledTimes(1);
    expect(mockComputeTemporalCoupling).not.toHaveBeenCalled();
  });

  it('session は commitHash を sessionId へ写像して computeSessionCoupling を使う', async () => {
    mockCreateClient.mockReturnValue(supabaseWith(files, sessions));
    await call({ granularity: 'session' });
    expect(mockComputeSessionCoupling).toHaveBeenCalledTimes(1);
    expect(mockComputeSessionCoupling.mock.calls[0][0]).toEqual([
      { sessionId: 's1', filePath: 'src/a.ts' },
      { sessionId: 's1', filePath: 'src/b.ts' },
    ]);
  });

  it('session + directional は computeSessionConfidenceCoupling を使う', async () => {
    mockCreateClient.mockReturnValue(supabaseWith(files, sessions));
    await call({ granularity: 'session', directional: 'true' });
    expect(mockComputeSessionConfidenceCoupling).toHaveBeenCalledTimes(1);
  });

  it('未知の granularity は commit として扱う', async () => {
    mockCreateClient.mockReturnValue(supabaseWith(files, sessions));
    const res = await call({ granularity: 'nonsense' });
    expect(res._body).toMatchObject({ granularity: 'commit' });
    expect(mockComputeTemporalCoupling).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/temporal-coupling — パラメータ', () => {
  const setup = () =>
    mockCreateClient.mockReturnValue(
      supabaseWith([{ commit_hash: 'h1', file_path: 'src/a.ts' }], { h1: 's1' }),
    );

  it('commit 粒度の既定は minChangeCount=5 / threshold=0.5 / maxFilesPerCommit=50', async () => {
    setup();
    await call();
    expect(mockComputeTemporalCoupling.mock.calls[0][1]).toMatchObject({
      minChangeCount: 5,
      jaccardThreshold: 0.5,
      topK: 50,
      maxFilesPerCommit: 50,
    });
  });

  it('session 粒度の既定は minChangeCount=3 / threshold=0.4 / maxFilesPerCommit=20', async () => {
    setup();
    await call({ granularity: 'session' });
    expect(mockComputeSessionCoupling.mock.calls[0][1]).toMatchObject({
      minChangeCount: 3,
      jaccardThreshold: 0.4,
      maxFilesPerCommit: 20,
    });
  });

  it('指定値は範囲内へクランプする', async () => {
    setup();
    await call({ windowDays: '9999', topK: '0', minChange: '99999', threshold: '5' });
    const res = mockComputeTemporalCoupling.mock.calls[0][1] as Record<string, number>;
    expect(res['topK']).toBe(1);
    expect(res['minChangeCount']).toBe(1000);
    expect(res['jaccardThreshold']).toBe(1);
  });

  it('数値でない指定は既定値へ戻す', async () => {
    setup();
    const res = await call({ windowDays: 'abc', threshold: 'xyz' });
    expect(res._body).toMatchObject({ windowDays: 30 });
    expect(mockComputeTemporalCoupling.mock.calls[0][1]).toMatchObject({ jaccardThreshold: 0.5 });
  });

  it('directional の confidence 系オプションを渡す', async () => {
    setup();
    await call({ directional: 'true', confidenceThreshold: '0.7', directionalDiff: '0.2' });
    expect(mockComputeConfidenceCoupling.mock.calls[0][1]).toMatchObject({
      confidenceThreshold: 0.7,
      directionalDiffThreshold: 0.2,
    });
  });
});

describe('GET /api/temporal-coupling — パスフィルタ', () => {
  it.each([
    ['package-lock.json', false],
    ['sub/yarn.lock', false],
    ['pnpm-lock.yaml', false],
    ['packages/x/dist/index.js', false],
    ['node_modules/foo/index.js', false],
    ['a/b.min.js', false],
    ['a/b.js.map', false],
    ['.worktrees/x/a.ts', false],
    ['.claude/settings.json', false],
    ['.vscode/tasks.json', false],
    ['packages/x/.next/build.js', false],
    ['out/a.js', false],
    ['build/a.js', false],
    ['coverage/lcov.info', false],
    ['packages/x/src/a.ts', true],
    ['README.md', true],
  ])('%s は %s として扱う', async (filePath, expected) => {
    mockCreateClient.mockReturnValue(
      supabaseWith([{ commit_hash: 'h1', file_path: 'src/a.ts' }], { h1: 's1' }),
    );
    await call();
    const opts = mockComputeTemporalCoupling.mock.calls[0][1] as { pathFilter: (p: string) => boolean };
    expect(opts.pathFilter(filePath)).toBe(expected);
  });
});

describe('GET /api/temporal-coupling — 異常系', () => {
  it('Supabase 環境変数が無ければ空応答', async () => {
    mockResolveSupabaseEnv.mockReturnValue(null);
    const res = await call();
    expect(res._body).toMatchObject({ edges: [], totalPairs: 0 });
    expect(res._headers).toEqual({ 'Cache-Control': 'no-store' });
  });

  it('セッションコミットが 0 件なら計算せず空応答', async () => {
    mockCreateClient.mockReturnValue(makeSupabase({ trail_session_commits: [{ data: [] }] }));
    const res = await call();
    expect(res._body).toMatchObject({ edges: [] });
    expect(mockComputeTemporalCoupling).not.toHaveBeenCalled();
  });

  it('例外時は空応答へフォールバックする', async () => {
    mockCreateClient.mockImplementation(() => {
      throw new Error('connect failed');
    });
    const res = await call();
    expect(res._body).toMatchObject({ edges: [], totalPairs: 0 });
  });

  it('未知のコミットに属する activity_commit_files は捨てる', async () => {
    mockCreateClient.mockReturnValue(
      supabaseWith(
        [
          { commit_hash: 'h1', file_path: 'src/a.ts' },
          { commit_hash: 'ghost', file_path: 'src/z.ts' },
        ],
        { h1: 's1' },
      ),
    );
    await call();
    expect(mockComputeTemporalCoupling.mock.calls[0][0]).toEqual([
      { commitHash: 'h1', filePath: 'src/a.ts' },
    ]);
  });
});
