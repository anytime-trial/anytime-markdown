import { createClient } from '@supabase/supabase-js';
import { SupabaseTrailStore } from '../SupabaseTrailStore';
import { isRetryableRemoteError, summarizeRemoteError } from '../remoteRetry';
import type { MessageRow, SessionRow } from '../TrailDatabase';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

type UpsertResponse = { error: { message: string; code?: string | null } | null };

/** upsert 呼び出しごとに、キューに積んだ応答を順に返す fake Supabase client。 */
function fakeClient(responses: UpsertResponse[]): { client: unknown; calls: { table: string; rowCount: number }[] } {
  const calls: { table: string; rowCount: number }[] = [];
  const client = {
    from: (table: string) => ({
      upsert: (payload: unknown[]) => {
        calls.push({ table, rowCount: Array.isArray(payload) ? payload.length : 1 });
        const next = responses.shift() ?? { error: null };
        return Promise.resolve(next);
      },
    }),
  };
  return { client, calls };
}

const HTML_ERROR_PAGE = '<!DOCTYPE html>\n<html><body>502 Bad Gateway</body></html>';

function makeStore(responses: UpsertResponse[]): {
  store: SupabaseTrailStore;
  calls: { table: string; rowCount: number }[];
} {
  const { client, calls } = fakeClient(responses);
  (createClient as jest.Mock).mockReturnValue(client);
  // リトライ間隔 0ms（実時間を待たない）。
  const store = new SupabaseTrailStore('https://example.test', 'service-key', undefined, {
    retryDelaysMs: [0, 0, 0],
  });
  return { store, calls };
}

const session = (id: string): SessionRow => ({ id, slug: id } as unknown as SessionRow);
const message = (uuid: string): MessageRow => ({ uuid, session_id: 's1' } as unknown as MessageRow);

beforeEach(() => {
  (createClient as jest.Mock).mockReset();
});

describe('isRetryableRemoteError', () => {
  it('制約違反 (23503) は再試行しない', () => {
    expect(isRetryableRemoteError({ message: 'fk violation', code: '23503' })).toBe(false);
  });

  it('接続過多 (53300) / statement timeout (57014) は再試行する', () => {
    expect(isRetryableRemoteError({ message: 'too many connections', code: '53300' })).toBe(true);
    expect(isRetryableRemoteError({ message: 'canceling statement', code: '57014' })).toBe(true);
  });

  it('PostgREST のリクエスト不正 (PGRST204) は再試行しない', () => {
    expect(isRetryableRemoteError({ message: 'column not found', code: 'PGRST204' })).toBe(false);
  });

  it('code なし (ネットワーク断・ゲートウェイの HTML エラー) は再試行する', () => {
    expect(isRetryableRemoteError({ message: 'fetch failed' })).toBe(true);
    expect(isRetryableRemoteError({ message: HTML_ERROR_PAGE })).toBe(true);
  });
});

describe('summarizeRemoteError', () => {
  it('HTML エラーページを 1 行へ要約する（全文を垂れ流さない）', () => {
    const summary = summarizeRemoteError({ message: HTML_ERROR_PAGE });
    expect(summary).toContain('non-JSON response from gateway');
    expect(summary).not.toContain('<html>');
  });
});

describe('SupabaseTrailStore の再試行', () => {
  it('一過性エラーを再試行し、成功したらセッションを取りこぼさない', async () => {
    const { store, calls } = makeStore([
      { error: { message: HTML_ERROR_PAGE } },
      { error: { message: 'fetch failed' } },
      { error: null },
    ]);
    await store.connect();

    await expect(store.upsertSessions([session('s1')])).resolves.toBeUndefined();
    expect(calls).toHaveLength(3);
  });

  it('制約違反は再試行せず即座に失敗する', async () => {
    const { store, calls } = makeStore([
      { error: { message: 'violates foreign key constraint', code: '23503' } },
    ]);
    await store.connect();

    await expect(store.upsertSessions([session('s1')])).rejects.toThrow(/23503/);
    expect(calls).toHaveLength(1);
  });

  it('再試行を使い切ったら失敗し、HTML 応答は要約して報告する', async () => {
    const { store, calls } = makeStore([
      { error: { message: HTML_ERROR_PAGE } },
      { error: { message: HTML_ERROR_PAGE } },
      { error: { message: HTML_ERROR_PAGE } },
      { error: { message: HTML_ERROR_PAGE } },
    ]);
    await store.connect();

    await expect(store.upsertReleaseGraph(1, '{}')).rejects.toThrow(/non-JSON response from gateway/);
    expect(calls).toHaveLength(4); // 初回 + 3 リトライ
  });
});

describe('SupabaseTrailStore のチャンク隔離', () => {
  it('チャンクが 1 つ失敗しても残りのチャンクを送り、届いた uuid だけを返す', async () => {
    const rows = Array.from({ length: 600 }, (_, i) => message(`m${i}`));
    // 1 チャンク目 (500 行) は恒久エラーで失敗、2 チャンク目 (100 行) は成功。
    const { store, calls } = makeStore([
      { error: { message: 'null value in column violates not-null', code: '23502' } },
      { error: null },
    ]);
    await store.connect();

    const persisted = await store.upsertMessages(rows);

    expect(calls.map((c) => c.rowCount)).toEqual([500, 100]);
    expect(persisted).toHaveLength(100);
    expect(persisted[0]).toBe('m500');
  });

  it('チャンク失敗を握り潰さず、行数付きで throw する (session_costs)', async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({
      session_id: `s${i}`, model: 'm', input_tokens: 0, output_tokens: 0,
      cache_read_tokens: 0, cache_creation_tokens: 0, estimated_cost_usd: 0,
    }));
    const { store, calls } = makeStore([
      { error: null },
      { error: { message: 'violates foreign key constraint', code: '23503' } },
    ]);
    await store.connect();

    await expect(store.upsertAllSessionCosts(rows)).rejects.toThrow(/failed for 1\/501 rows/);
    // 2 チャンク目が失敗しても 1 チャンク目は送信済み（部分同期を捨てない）。
    expect(calls.map((c) => c.rowCount)).toEqual([500, 1]);
  });
});
