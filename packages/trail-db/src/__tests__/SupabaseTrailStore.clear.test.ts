import { createClient } from '@supabase/supabase-js';
import { SupabaseTrailStore } from '../SupabaseTrailStore';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

type RemoteResponse = { error: { message: string; code?: string | null } | null };

const STATEMENT_TIMEOUT = { message: 'canceling statement due to statement timeout', code: '57014' };

/**
 * テーブルごとに行（主キー値）を保持する fake Supabase client。
 * `timeoutAbove[table]` を超える件数の `.in()` 削除は statement timeout を返す
 * （CASCADE 先が重い親テーブルを一度に消すと Supabase の statement timeout に当たる状況の再現）。
 */
function fakeClient(
  tables: Record<string, string[]>,
  timeoutAbove: Record<string, number>,
): { client: unknown; deleteOrder: string[] } {
  const deleteOrder: string[] = [];
  const client = {
    from: (table: string) => ({
      select: (column: string) => ({
        limit: (n: number) =>
          Promise.resolve({ data: (tables[table] ?? []).slice(0, n).map((id) => ({ [column]: id })), error: null }),
      }),
      delete: () => ({
        in: (_column: string, ids: string[]): Promise<RemoteResponse> => {
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
  return { client, deleteOrder };
}

const ids = (prefix: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe('SupabaseTrailStore.unsafeClearAll のページング削除', () => {
  beforeEach(() => {
    (createClient as jest.Mock).mockReset();
  });

  it('statement timeout を返したページは件数を縮めて消し切る', async () => {
    const tables = { trail_releases: ids('r', 120), trail_release_graphs: ids('g', 30) };
    const { client } = fakeClient(tables, { trail_releases: 50 });
    (createClient as jest.Mock).mockReturnValue(client);
    const store = new SupabaseTrailStore('https://example.test', 'key', undefined, { retryDelaysMs: [0, 0, 0] });
    await store.connect();

    await expect(store.unsafeClearAll()).resolves.toBeUndefined();
    expect(tables.trail_releases).toEqual([]);
  });

  it('重い子テーブル（release graphs）を親 trail_releases より先に消す', async () => {
    const tables = { trail_releases: ids('r', 3), trail_release_graphs: ids('g', 3), trail_release_code_graphs: ids('c', 3) };
    const { client, deleteOrder } = fakeClient(tables, {});
    (createClient as jest.Mock).mockReturnValue(client);
    const store = new SupabaseTrailStore('https://example.test', 'key', undefined, { retryDelaysMs: [0, 0, 0] });
    await store.connect();

    await store.unsafeClearAll();

    const releases = deleteOrder.indexOf('trail_releases');
    expect(deleteOrder.indexOf('trail_release_graphs')).toBeLessThan(releases);
    expect(deleteOrder.indexOf('trail_release_code_graphs')).toBeLessThan(releases);
  });

  it('1 行でも timeout する場合は縮め切った後に throw する', async () => {
    const tables = { trail_releases: ids('r', 4) };
    const { client } = fakeClient(tables, { trail_releases: 0 });
    (createClient as jest.Mock).mockReturnValue(client);
    const store = new SupabaseTrailStore('https://example.test', 'key', undefined, { retryDelaysMs: [0, 0, 0] });
    await store.connect();

    await expect(store.unsafeClearAll()).rejects.toThrow(/trail_releases.*statement timeout/);
  });
});
