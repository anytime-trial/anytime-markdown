/**
 * SessionReader.getSessions の取得上限（egress 対策）のテスト。
 * 全件 select ではなく直近 200 件に制限されることを検証する。
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { SessionReader } from '../SessionReader';

interface RecordedCall {
  table: string;
  ops: Array<[string, unknown[]]>;
}

function createMockClient(resolver: (call: RecordedCall) => unknown[]): { client: SupabaseClient; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const client = {
    from(table: string) {
      const call: RecordedCall = { table, ops: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'order', 'limit', 'range', 'gte', 'lte', 'gt', 'lt', 'eq', 'in', 'not', 'maybeSingle']) {
        builder[m] = (...args: unknown[]) => {
          call.ops.push([m, args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: resolver(call), error: null });
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe('SessionReader.getSessions limit', () => {
  it('trail_sessions の取得を直近 200 件に制限する', async () => {
    const { client, calls } = createMockClient(() => []);
    const reader = new SessionReader(client);
    await reader.getSessions();

    const sessionsCall = calls.find((c) => c.table === 'trail_sessions');
    expect(sessionsCall).toBeDefined();
    const limitOp = sessionsCall?.ops.find(([m]) => m === 'limit');
    expect(limitOp).toEqual(['limit', [200]]);
  });

  it('フィルタ指定時も limit を維持する', async () => {
    const { client, calls } = createMockClient(() => []);
    const reader = new SessionReader(client);
    await reader.getSessions({ model: 'claude-fable-5' });

    const sessionsCall = calls.find((c) => c.table === 'trail_sessions');
    expect(sessionsCall?.ops.find(([m]) => m === 'limit')).toEqual(['limit', [200]]);
    expect(sessionsCall?.ops.find(([m]) => m === 'eq')).toEqual(['eq', ['model', 'claude-fable-5']]);
  });
});
