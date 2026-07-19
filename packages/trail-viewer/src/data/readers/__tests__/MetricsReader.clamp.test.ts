/**
 * MetricsReader.getQualityMetrics の全期間クランプ（egress 対策）のテスト。
 * - from はデータ最古の committed_at へクランプされる
 * - 前期間がデータ最古以前に丸ごと落ちる場合、前期間の fetch はスキップされる
 *   （from=1970 指定で 1913〜1969 のような無駄レンジ照会が走らない）
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { MetricsReader } from '../MetricsReader';

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

const EARLIEST = '2026-02-01T00:00:00.000Z';

/** 最古 committed_at プローブ（limit 1）にのみ実データを返すリゾルバ。 */
function probeAwareResolver(call: RecordedCall): unknown[] {
  if (call.table === 'trail_session_commits' && call.ops.some(([m, args]) => m === 'limit' && args[0] === 1)) {
    return [{ committed_at: EARLIEST }];
  }
  return [];
}

function commitRangeCalls(calls: RecordedCall[]): RecordedCall[] {
  // 範囲付き commits 取得 = gte(committed_at, from) を含む呼び出し（プローブは gte を持たない）
  return calls.filter(
    (c) => c.table === 'trail_session_commits' && c.ops.some(([m, args]) => m === 'gte' && args[0] === 'committed_at'),
  );
}

describe('MetricsReader.getQualityMetrics clamp', () => {
  it('from=1970 をデータ最古 committed_at へクランプし、前期間 fetch をスキップする', async () => {
    const { client, calls } = createMockClient(probeAwareResolver);
    const reader = new MetricsReader(client);
    const result = await reader.getQualityMetrics({
      from: '1970-01-01T00:00:00.000Z',
      to: '2026-07-19T00:00:00.000Z',
    });

    // commits の範囲照会は現行期間の 1 回のみで、from はクランプ後の値
    const ranged = commitRangeCalls(calls);
    expect(ranged).toHaveLength(1);
    const gteArg = ranged[0].ops.find(([m]) => m === 'gte');
    expect(gteArg?.[1]).toEqual(['committed_at', EARLIEST]);

    // releases もクランプ後 from の 1 回のみ（1913〜1969 型の前期間照会が無い）
    const releaseCalls = calls.filter((c) => c.table === 'trail_releases');
    expect(releaseCalls).toHaveLength(1);
    expect(releaseCalls[0].ops.find(([m]) => m === 'gte')?.[1]).toEqual(['released_at', EARLIEST]);

    // 応答の range.from は計測窓の事実（クランプ後）を反映する
    expect(result.range.from).toBe(EARLIEST);
  });

  it('from が最古より新しい通常レンジではクランプせず前期間も照会する', async () => {
    const { client, calls } = createMockClient(probeAwareResolver);
    const reader = new MetricsReader(client);
    await reader.getQualityMetrics({
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-07-01T00:00:00.000Z',
    });

    const ranged = commitRangeCalls(calls);
    expect(ranged).toHaveLength(2);
    const froms = ranged.map((c) => c.ops.find(([m]) => m === 'gte')?.[1][1]).sort();
    expect(froms[1]).toBe('2026-06-01T00:00:00.000Z');
    // 前期間は 2026-05 付近（epoch 前ではない）
    expect(String(froms[0]).startsWith('2026-05')).toBe(true);
  });

  it('データ 0 件（最古なし）では前期間をスキップして空メトリクスを返す', async () => {
    const { client, calls } = createMockClient(() => []);
    const reader = new MetricsReader(client);
    const result = await reader.getQualityMetrics({
      from: '1970-01-01T00:00:00.000Z',
      to: '2026-07-19T00:00:00.000Z',
    });

    expect(commitRangeCalls(calls)).toHaveLength(1);
    expect(calls.filter((c) => c.table === 'trail_releases')).toHaveLength(1);
    expect(result).toBeDefined();
  });
});
