import { createClient } from '@supabase/supabase-js';
import { SupabaseTrailStore } from '../SupabaseTrailStore';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

type RemoteError = { message: string; code?: string | null };
type RemoteResponse = { error: RemoteError | null };

const STATEMENT_TIMEOUT = { message: 'canceling statement due to statement timeout', code: '57014' };

/**
 * テーブルごとに行（主キー値）を保持する fake Supabase client。
 * `timeoutAbove[table]` を超える件数の `.in()` 削除は statement timeout を返す
 * （CASCADE 先が重い親テーブルを一度に消すと Supabase の statement timeout に当たる状況の再現）。
 * `failWith[table]` があればその表の `.in()` 削除は常にそのエラーを返す。
 * `transientTimeouts[table]` 回目までの削除は件数によらず timeout を返す（一過性の負荷の再現）。
 * `.in()` に渡された件数は表ごとに `attempts` へ記録する。
 */
function fakeClient(
  tables: Record<string, string[]>,
  timeoutAbove: Record<string, number>,
  failWith: Record<string, RemoteError> = {},
  transientTimeouts: Record<string, number> = {},
): { client: unknown; deleteOrder: string[]; attempts: Record<string, number[]> } {
  const deleteOrder: string[] = [];
  const attempts: Record<string, number[]> = {};
  const client = {
    from: (table: string) => ({
      select: (column: string) => ({
        limit: (n: number) =>
          Promise.resolve({ data: (tables[table] ?? []).slice(0, n).map((id) => ({ [column]: id })), error: null }),
      }),
      delete: () => ({
        in: (_column: string, ids: string[]): Promise<RemoteResponse> => {
          (attempts[table] ??= []).push(ids.length);
          if (failWith[table]) return Promise.resolve({ error: failWith[table] });
          if (attempts[table].length <= (transientTimeouts[table] ?? 0)) return Promise.resolve({ error: STATEMENT_TIMEOUT });
          if (ids.length > (timeoutAbove[table] ?? Infinity)) return Promise.resolve({ error: STATEMENT_TIMEOUT });
          tables[table] = (tables[table] ?? []).filter((id) => !ids.includes(id));
          if (!deleteOrder.includes(table)) deleteOrder.push(table);
          return Promise.resolve({ error: null });
        },
        gte: (): Promise<RemoteResponse> => Promise.resolve({ error: null }),
        gt: (): Promise<RemoteResponse> => Promise.resolve({ error: null }),
      }),
    }),
  };
  return { client, deleteOrder, attempts };
}

const ids = (prefix: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

async function connectedStore(client: unknown): Promise<SupabaseTrailStore> {
  (createClient as jest.Mock).mockReturnValue(client);
  const store = new SupabaseTrailStore('https://example.test', 'key', undefined, { retryDelaysMs: [0, 0, 0] });
  await store.connect();
  return store;
}

describe('SupabaseTrailStore.unsafeClearAll のページング削除', () => {
  beforeEach(() => {
    (createClient as jest.Mock).mockReset();
  });

  it('statement timeout を返したページは半分ずつ縮めて消し切る', async () => {
    const tables = { trail_releases: ids('r', 120) };
    const { client, attempts } = fakeClient(tables, { trail_releases: 50 });
    const store = await connectedStore(client);

    await expect(store.unsafeClearAll()).resolves.toBeUndefined();

    expect(tables.trail_releases).toEqual([]);
    // 120 → 60 → 30 で通り、以降は 30 件ページのまま残りを消す。
    expect(attempts.trail_releases.slice(0, 3)).toEqual([120, 60, 30]);
  });

  it('縮めた後も成功が続けば件数を倍に戻す', async () => {
    const tables = { trail_messages: ids('m', 3000) };
    const { client, attempts } = fakeClient(tables, {}, {}, { trail_messages: 1 });
    const store = await connectedStore(client);

    await store.unsafeClearAll();

    expect(tables.trail_messages).toEqual([]);
    // 500 で一過性 timeout → 250 で 4 回成功 → 500 へ戻る。
    expect(attempts.trail_messages.slice(0, 7)).toEqual([500, 250, 250, 250, 250, 500, 500]);
  });

  it('graph_json を持つ子テーブルを 20 件ページで親 trail_releases より先に消す', async () => {
    const tables = {
      trail_releases: ids('r', 3),
      trail_release_graphs: ids('g', 45),
      trail_release_code_graphs: ids('c', 3),
    };
    const { client, deleteOrder, attempts } = fakeClient(tables, {});
    const store = await connectedStore(client);

    await store.unsafeClearAll();

    const releases = deleteOrder.indexOf('trail_releases');
    expect(deleteOrder.indexOf('trail_release_graphs')).toBeLessThan(releases);
    expect(deleteOrder.indexOf('trail_release_code_graphs')).toBeLessThan(releases);
    expect(attempts.trail_release_graphs).toEqual([20, 20, 5]);
  });

  it('1 行でも timeout する場合は再試行を使い切って throw する（二重実行しない）', async () => {
    const tables = { trail_releases: ids('r', 4) };
    const { client, attempts } = fakeClient(tables, { trail_releases: 0 });
    const store = await connectedStore(client);

    await expect(store.unsafeClearAll()).rejects.toThrow(/trail_releases.*statement timeout/);
    // 4 → 2 → 1 と縮め、1 行は runWithRetry の 1 + 3 回だけ試す。
    expect(attempts.trail_releases).toEqual([4, 2, 1, 1, 1, 1]);
  });

  it('再試行不能なエラーは縮めも再試行もせず throw する', async () => {
    const tables = { trail_releases: ids('r', 4) };
    const { client, attempts } = fakeClient(tables, {}, {
      trail_releases: { message: 'permission denied', code: '42501' },
    });
    const store = await connectedStore(client);

    await expect(store.unsafeClearAll()).rejects.toThrow(/trail_releases.*42501/);
    expect(attempts.trail_releases).toEqual([4]);
  });
});
