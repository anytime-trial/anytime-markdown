import { createClient } from '@supabase/supabase-js';
import { SupabaseTrailStore } from '../SupabaseTrailStore';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

type RemoteError = { message: string; code?: string | null };
type RemoteResponse = { error: RemoteError | null };
type Key = string | number;

const STATEMENT_TIMEOUT = { message: 'canceling statement due to statement timeout', code: '57014' };

interface FakeOptions {
  /** この件数を超える `.in()` 削除は statement timeout を返す（CASCADE 先が重い削除の再現）。 */
  readonly timeoutAbove?: Record<string, number>;
  /** その表の `.in()` 削除は常にこのエラーを返す。 */
  readonly failWith?: Record<string, RemoteError>;
  /** その表の最初の N 回の削除は件数によらず timeout を返す（一過性の負荷の再現）。 */
  readonly transientTimeouts?: Record<string, number>;
}

/**
 * テーブルごとに行（主キー値）を保持する fake Supabase client。
 * `.in()` に渡された件数は表ごとに `attempts` へ、削除が成功した表の順は `deleteOrder` へ記録する。
 */
function fakeClient(
  tables: Record<string, Key[]>,
  { timeoutAbove = {}, failWith = {}, transientTimeouts = {} }: FakeOptions = {},
): { client: unknown; deleteOrder: string[]; attempts: Record<string, number[]> } {
  const deleteOrder: string[] = [];
  const attempts: Record<string, number[]> = {};
  const rows = (table: string, column: string, from: number, to: number) =>
    // 複数列 select（'release_id, updated_at'）は先頭列を主キーとして返す。
    (tables[table] ?? []).slice(from, to).map((id) => ({ [column.split(',')[0].trim()]: id }));
  const client = {
    from: (table: string) => ({
      select: (column: string) => ({
        limit: (n: number) => Promise.resolve({ data: rows(table, column, 0, n), error: null }),
        order: () => ({
          range: (from: number, to: number) => Promise.resolve({ data: rows(table, column, from, to + 1), error: null }),
        }),
      }),
      delete: () => ({
        in: (_column: string, ids: Key[]): Promise<RemoteResponse> => {
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
const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);

async function connectedStore(client: unknown): Promise<SupabaseTrailStore> {
  (createClient as jest.Mock).mockReturnValue(client);
  const store = new SupabaseTrailStore('https://example.test', 'key', undefined, { retryDelaysMs: [0, 0, 0] });
  await store.connect();
  return store;
}

beforeEach(() => {
  (createClient as jest.Mock).mockReset();
});

describe('SupabaseTrailStore のページング削除', () => {
  it('statement timeout を返したページは半分ずつ縮めて消し切る', async () => {
    const tables = { trail_messages: ids('m', 120) };
    const { client, attempts } = fakeClient(tables, { timeoutAbove: { trail_messages: 50 } });
    const store = await connectedStore(client);

    await expect(store.unsafeClearAll()).resolves.toBeUndefined();

    expect(tables.trail_messages).toEqual([]);
    // 120 → 60 → 30 で通り、以降は 30 件ページのまま残りを消す。
    expect(attempts.trail_messages.slice(0, 3)).toEqual([120, 60, 30]);
  });

  it('縮めた後も成功が続けば件数を倍に戻す', async () => {
    const tables = { trail_messages: ids('m', 3000) };
    const { client, attempts } = fakeClient(tables, { transientTimeouts: { trail_messages: 1 } });
    const store = await connectedStore(client);

    await store.unsafeClearAll();

    expect(tables.trail_messages).toEqual([]);
    // 500 で一過性 timeout → 250 で 4 回成功 → 500 へ戻る。
    expect(attempts.trail_messages.slice(0, 7)).toEqual([500, 250, 250, 250, 250, 500, 500]);
  });

  it('1 行でも timeout する場合は再試行を使い切って throw する（二重実行しない）', async () => {
    const tables = { trail_messages: ids('m', 4) };
    const { client, attempts } = fakeClient(tables, { timeoutAbove: { trail_messages: 0 } });
    const store = await connectedStore(client);

    await expect(store.unsafeClearAll()).rejects.toThrow(/trail_messages.*statement timeout/);
    // 4 → 2 → 1 と縮め、1 行は runWithRetry の 1 + 3 回だけ試す。
    expect(attempts.trail_messages).toEqual([4, 2, 1, 1, 1, 1]);
  });

  it('再試行不能なエラーは縮めも再試行もせず throw する', async () => {
    const tables = { trail_messages: ids('m', 4) };
    const { client, attempts } = fakeClient(tables, {
      failWith: { trail_messages: { message: 'permission denied', code: '42501' } },
    });
    const store = await connectedStore(client);

    await expect(store.unsafeClearAll()).rejects.toThrow(/trail_messages.*42501/);
    expect(attempts.trail_messages).toEqual([4]);
  });

  it('unsafeClearAll は差分同期する release と release graph を消さない', async () => {
    const tables = { trail_releases: [1, 2], trail_release_graphs: [1, 2] };
    const { client } = fakeClient(tables);
    const store = await connectedStore(client);

    await store.unsafeClearAll();

    expect(tables).toEqual({ trail_releases: [1, 2], trail_release_graphs: [1, 2] });
  });
});

describe('SupabaseTrailStore.unsafePruneReleases', () => {
  it('残す集合に無い release だけを、graph を 20 件ページで先に消してから消す', async () => {
    const tables = {
      trail_releases: range(1, 50),
      trail_release_graphs: range(1, 50),
      trail_release_code_graphs: range(1, 50),
    };
    const { client, deleteOrder, attempts } = fakeClient(tables);
    const store = await connectedStore(client);

    await store.unsafePruneReleases(new Set(range(1, 5)));

    expect(tables.trail_releases).toEqual(range(1, 5));
    expect(tables.trail_release_graphs).toEqual(range(1, 5));
    expect(deleteOrder.indexOf('trail_release_graphs')).toBeLessThan(deleteOrder.indexOf('trail_releases'));
    expect(attempts.trail_release_graphs).toEqual([20, 20, 5]);
  });

  it('消す release が無ければ削除を呼ばない', async () => {
    const tables = { trail_releases: [1, 2] };
    const { client, attempts } = fakeClient(tables);
    const store = await connectedStore(client);

    await store.unsafePruneReleases(new Set([1, 2, 3]));

    expect(attempts).toEqual({});
  });
});

describe('SupabaseTrailStore.getReleaseGraphVersions', () => {
  it('1000 行を超えても range でページを進めて読み切る', async () => {
    const tables = { trail_release_graphs: range(1, 2500) };
    const { client } = fakeClient(tables);
    const store = await connectedStore(client);

    const versions = await store.getReleaseGraphVersions();

    expect(versions.size).toBe(2500);
  });
});
