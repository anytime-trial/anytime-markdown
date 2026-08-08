/**
 * /api/defect-risk (GET) のユニットテスト
 *
 * クエリのクランプ、Supabase 未設定・0 件・repo 絞り込み・1000 件ページングの
 * 打ち切り条件、例外時の空応答フォールバックを固定する。
 */

const mockCreateClient = jest.fn();
const mockResolveSupabaseEnv = jest.fn();
const mockResolveRepoId = jest.fn();
const mockComputeDefectRisk = jest.fn();

jest.mock('@supabase/supabase-js', () => ({ createClient: mockCreateClient }));
jest.mock('../lib/supabase-env', () => ({ resolveSupabaseEnv: mockResolveSupabaseEnv }));
jest.mock('../lib/api-helpers', () => ({
  NO_STORE_HEADERS: { 'Cache-Control': 'no-store' },
  resolveRepoId: mockResolveRepoId,
}));
jest.mock('@anytime-markdown/trail-activity', () => ({ computeDefectRisk: mockComputeDefectRisk }));

type MockResp = { _body: Record<string, unknown>; _headers: Record<string, string> };

class MockNextResponse {
  static json = jest.fn(
    (body: unknown, init?: { headers?: Record<string, string> }) =>
      ({ _body: body, _headers: init?.headers ?? {} }) as MockResp,
  );
}
jest.mock('next/server', () => ({ NextResponse: MockNextResponse }));

import { GET } from '../app/api/defect-risk/route';

/**
 * テーブル名 → 応答バッチ列で駆動する Supabase クライアントのスタブ。
 * `.select()/.gte()/.eq()/.order()` はチェーンを返し、`.range()` で次のバッチを消費する。
 */
function makeSupabase(batches: Record<string, Array<{ data?: unknown[]; error?: unknown }>>) {
  const calls: Array<{ table: string; from: number; to: number }> = [];
  const client = {
    from(table: string) {
      const queued = batches[table] ?? [];
      const chain = {
        select: () => chain,
        gte: () => chain,
        eq: () => chain,
        order: () => chain,
        range: (from: number, to: number) => {
          calls.push({ table, from, to });
          return Promise.resolve(queued.shift() ?? { data: [], error: null });
        },
      };
      return chain;
    },
  };
  return { client, calls };
}

function makeRequest(params: Record<string, string> = {}): import('next/server').NextRequest {
  return {
    nextUrl: { searchParams: new URLSearchParams(params) },
  } as unknown as import('next/server').NextRequest;
}

const call = async (params: Record<string, string> = {}): Promise<MockResp> =>
  (await GET(makeRequest(params))) as unknown as MockResp;

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveSupabaseEnv.mockReturnValue({ url: 'https://x.supabase.co', anonKey: 'anon' });
  mockComputeDefectRisk.mockReturnValue([]);
  mockResolveRepoId.mockResolvedValue(1);
});

describe('GET /api/defect-risk — パラメータのクランプ', () => {
  it('未指定なら windowDays / halfLifeDays は 90', async () => {
    mockResolveSupabaseEnv.mockReturnValue(null);
    const res = await call();
    expect(res._body).toMatchObject({ windowDays: 90, halfLifeDays: 90, entries: [], totalFiles: 0 });
    expect(res._headers).toEqual({ 'Cache-Control': 'no-store' });
  });

  it('範囲外の値は下限・上限へ丸める', async () => {
    mockResolveSupabaseEnv.mockReturnValue(null);
    const low = await call({ windowDays: '0', halfLifeDays: '0' });
    expect(low._body).toMatchObject({ windowDays: 1, halfLifeDays: 1 });
    const high = await call({ windowDays: '9999', halfLifeDays: '9999' });
    expect(high._body).toMatchObject({ windowDays: 365, halfLifeDays: 730 });
  });

  it('数値でない値は既定値へ戻す', async () => {
    mockResolveSupabaseEnv.mockReturnValue(null);
    const res = await call({ windowDays: 'abc', halfLifeDays: 'xyz' });
    expect(res._body).toMatchObject({ windowDays: 90, halfLifeDays: 90 });
  });
});

describe('GET /api/defect-risk — データ取得', () => {
  it('セッションコミットが 0 件なら空応答を返す', async () => {
    const { client } = makeSupabase({ trail_session_commits: [{ data: [] }] });
    mockCreateClient.mockReturnValue(client);
    const res = await call();
    expect(res._body).toMatchObject({ entries: [], totalFiles: 0 });
    expect(mockComputeDefectRisk).not.toHaveBeenCalled();
  });

  it('commit_files を突き合わせて CommitRiskRow を組み立てる', async () => {
    const { client } = makeSupabase({
      trail_session_commits: [
        { data: [{ commit_hash: 'h1', session_id: 's1', commit_message: 'fix: bug', committed_at: '2026-01-01T00:00:00Z' }] },
      ],
      trail_commit_files: [
        {
          data: [
            { commit_hash: 'h1', file_path: 'src/a.ts' },
            // 未知のコミットは除外される
            { commit_hash: 'unknown', file_path: 'src/b.ts' },
            // file_path が空の行も除外される
            { commit_hash: 'h1', file_path: '' },
          ],
        },
      ],
    });
    mockCreateClient.mockReturnValue(client);
    mockComputeDefectRisk.mockReturnValue([{ filePath: 'src/a.ts', score: 0.5 }]);

    const res = await call({ halfLifeDays: '30' });

    expect(mockComputeDefectRisk).toHaveBeenCalledWith(
      [
        {
          commitHash: 'h1',
          filePath: 'src/a.ts',
          commitMessage: 'fix: bug',
          committedAt: '2026-01-01T00:00:00Z',
        },
      ],
      { halfLifeDays: 30 },
    );
    expect(res._body).toMatchObject({ totalFiles: 1 });
  });

  it('commit_message が null なら空文字にする', async () => {
    const { client } = makeSupabase({
      trail_session_commits: [
        { data: [{ commit_hash: 'h1', session_id: 's1', commit_message: null, committed_at: '2026-01-01T00:00:00Z' }] },
      ],
      trail_commit_files: [{ data: [{ commit_hash: 'h1', file_path: 'src/a.ts' }] }],
    });
    mockCreateClient.mockReturnValue(client);
    await call();
    expect(mockComputeDefectRisk.mock.calls[0][0][0]).toMatchObject({ commitMessage: '' });
  });

  it('1000 件ちょうどのバッチは次ページを取りに行く', async () => {
    const full = Array.from({ length: 1000 }, (_, i) => ({
      commit_hash: `h${i}`,
      session_id: 's1',
      commit_message: 'm',
      committed_at: '2026-01-01T00:00:00Z',
    }));
    const { client, calls } = makeSupabase({
      trail_session_commits: [{ data: full }, { data: [] }],
      trail_commit_files: [{ data: [] }],
    });
    mockCreateClient.mockReturnValue(client);
    await call();
    const sessionCalls = calls.filter((c) => c.table === 'trail_session_commits');
    expect(sessionCalls).toEqual([
      { table: 'trail_session_commits', from: 0, to: 999 },
      { table: 'trail_session_commits', from: 1000, to: 1999 },
    ]);
  });

  it('error が返ったらページングを打ち切る', async () => {
    const { client, calls } = makeSupabase({
      trail_session_commits: [{ error: { message: 'boom' } }],
    });
    mockCreateClient.mockReturnValue(client);
    const res = await call();
    expect(calls.filter((c) => c.table === 'trail_session_commits')).toHaveLength(1);
    expect(res._body).toMatchObject({ entries: [] });
  });
});

describe('GET /api/defect-risk — repo による絞り込み', () => {
  const sessionCommits = [
    { commit_hash: 'h1', session_id: 's1', commit_message: 'm1', committed_at: '2026-01-01T00:00:00Z' },
    { commit_hash: 'h2', session_id: 's2', commit_message: 'm2', committed_at: '2026-01-02T00:00:00Z' },
  ];

  it('repo に属するセッションのコミットだけ残す', async () => {
    const { client } = makeSupabase({
      trail_session_commits: [{ data: sessionCommits }],
      trail_sessions: [{ data: [{ id: 's2' }] }],
      trail_commit_files: [
        {
          data: [
            { commit_hash: 'h1', file_path: 'src/a.ts' },
            { commit_hash: 'h2', file_path: 'src/b.ts' },
          ],
        },
      ],
    });
    mockCreateClient.mockReturnValue(client);
    await call({ repo: 'my-repo' });
    expect(mockComputeDefectRisk.mock.calls[0][0]).toEqual([
      expect.objectContaining({ commitHash: 'h2', filePath: 'src/b.ts' }),
    ]);
  });

  it('repo が未登録（repoId が null）なら空応答', async () => {
    mockResolveRepoId.mockResolvedValue(null);
    const { client } = makeSupabase({ trail_session_commits: [{ data: sessionCommits }] });
    mockCreateClient.mockReturnValue(client);
    const res = await call({ repo: 'unknown-repo' });
    expect(res._body).toMatchObject({ entries: [], totalFiles: 0 });
    expect(mockComputeDefectRisk).not.toHaveBeenCalled();
  });
});

describe('GET /api/defect-risk — 異常系', () => {
  it('Supabase 環境変数が無ければ空応答', async () => {
    mockResolveSupabaseEnv.mockReturnValue(null);
    const res = await call();
    expect(res._body).toMatchObject({ entries: [], totalFiles: 0 });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('途中で例外が出ても空応答へフォールバックし、握り潰さずログへ出す', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockCreateClient.mockImplementation(() => {
      throw new Error('connect failed');
    });
    const res = await call();
    expect(res._body).toMatchObject({ entries: [], totalFiles: 0 });
    expect(spy).toHaveBeenCalledWith('[/api/defect-risk] error', expect.any(Error));
    spy.mockRestore();
  });
});
