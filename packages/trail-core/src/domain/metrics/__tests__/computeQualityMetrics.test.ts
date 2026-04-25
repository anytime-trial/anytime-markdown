import { computeQualityMetrics } from '../computeQualityMetrics';
import type { QualityMetricsInputs } from '../computeQualityMetrics';
import type { DateRange } from '../types';

const RANGE: DateRange = {
  from: '2026-04-20T00:00:00.000Z',
  to: '2026-04-20T23:59:59.999Z',
};

const INPUTS_WITH_COSTS: QualityMetricsInputs = {
  releases: [],
  messages: [
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
  ],
  messageCommits: [],
  commits: [
    {
      hash: 'h1',
      subject: 'test commit',
      committed_at: '2026-04-20T11:00:00.000Z',
      is_ai_assisted: true,
      files: ['src/foo.ts'],
      session_id: 's1',
      lines_added: 10,
      lines_deleted: 0,
    },
  ],
};

describe('computeQualityMetrics', () => {
  it('includes costPerLocTimeSeries alongside tokensPerLoc', () => {
    const result = computeQualityMetrics(INPUTS_WITH_COSTS, RANGE);
    expect(result.costPerLocTimeSeries).toBeDefined();
    expect(result.costPerLocTimeSeries?.length).toBe(result.metrics.tokensPerLoc.timeSeries.length);
  });

  it('costPerLocTimeSeries and tokensPerLoc timeSeries have matching bucketStart values', () => {
    const result = computeQualityMetrics(INPUTS_WITH_COSTS, RANGE);
    const costStarts = result.costPerLocTimeSeries?.map((b) => b.bucketStart) ?? [];
    const tokenStarts = result.metrics.tokensPerLoc.timeSeries.map((b) => b.bucketStart);
    expect(costStarts).toEqual(tokenStarts);
  });
});
