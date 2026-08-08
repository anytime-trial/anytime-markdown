import { computeTokensAndCostPerLocTimeSeries } from '../tokensPerLoc';

describe('computeTokensAndCostPerLocTimeSeries', () => {
  it('returns both tokens and cost time series with matching bucketStart', () => {
    const messages = [
      {
        uuid: 'u1',
        created_at: '2026-04-20T10:00:00.000Z',
        role: 'user',
        type: 'user',
        session_id: 's1',
        input_tokens: 100,
        output_tokens: 200,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
        cost_usd: 0.003,
      },
    ];
    const commits = [
      { hash: 'h1', committed_at: '2026-04-20T11:00:00.000Z', session_id: 's1', lines_added: 10, lines_deleted: 0 },
    ];
    const range = { from: '2026-04-20T00:00:00.000Z', to: '2026-04-20T23:59:59.999Z' };
    const result = computeTokensAndCostPerLocTimeSeries({ messages, commits }, range, 'day');

    expect(result.tokens).toHaveLength(1);
    expect(result.cost).toHaveLength(1);
    expect(result.tokens[0].bucketStart).toBe(result.cost[0].bucketStart);
    expect(result.tokens[0].value).toBe(30); // (100+200) / 10
    expect(result.cost[0].value).toBeCloseTo(0.0003, 6); // 0.003 / 10
  });

  it('returns zero values for buckets with no attributed commits', () => {
    const range = { from: '2026-04-20T00:00:00.000Z', to: '2026-04-21T23:59:59.999Z' };
    const result = computeTokensAndCostPerLocTimeSeries({ messages: [], commits: [] }, range, 'day');
    expect(result.tokens).toHaveLength(2);
    expect(result.cost).toHaveLength(2);
    expect(result.tokens.every((b) => b.value === 0)).toBe(true);
    expect(result.cost.every((b) => b.value === 0)).toBe(true);
  });

  it('returns zero cost when cost_usd is absent', () => {
    const messages = [
      {
        uuid: 'u1',
        created_at: '2026-04-20T10:00:00.000Z',
        role: 'user',
        type: 'user',
        session_id: 's1',
        input_tokens: 100,
        output_tokens: 200,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
      },
    ];
    const commits = [
      { hash: 'h1', committed_at: '2026-04-20T11:00:00.000Z', session_id: 's1', lines_added: 10, lines_deleted: 0 },
    ];
    const range = { from: '2026-04-20T00:00:00.000Z', to: '2026-04-20T23:59:59.999Z' };
    const result = computeTokensAndCostPerLocTimeSeries({ messages, commits }, range, 'day');

    expect(result.tokens[0].value).toBe(30);
    expect(result.cost[0].value).toBe(0);
  });
});
