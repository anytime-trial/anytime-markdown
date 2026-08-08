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

  it('includes leadTimeMinTimeSeries aligned with leadTimePerLoc timeSeries', () => {
    const result = computeQualityMetrics(INPUTS_WITH_COSTS, RANGE);
    expect(result.leadTimeMinTimeSeries).toBeDefined();
    const leadStarts = result.leadTimeMinTimeSeries?.map((b) => b.bucketStart) ?? [];
    const ratioStarts = result.metrics.leadTimePerLoc.timeSeries.map((b) => b.bucketStart);
    expect(leadStarts).toEqual(ratioStarts);
  });

  it('leadTimeMinTimeSeries sums commit lead-time minutes per bucket', () => {
    const result = computeQualityMetrics(INPUTS_WITH_COSTS, RANGE);
    const total = (result.leadTimeMinTimeSeries ?? []).reduce((s, b) => s + b.value, 0);
    // user message at 10:00, commit at 11:00 -> 60 minutes
    expect(total).toBe(60);
  });

  it('leadTimeUnmappedTimeSeries counts commits without preceding prompts', () => {
    const inputs: QualityMetricsInputs = {
      ...INPUTS_WITH_COSTS,
      commits: [
        // Mapped: has user prompt at 10:00 in same session
        { ...INPUTS_WITH_COSTS.commits[0] },
        // Unmapped: no session_id
        {
          hash: 'h-orphan',
          subject: 'fix: orphan',
          committed_at: '2026-04-20T12:00:00.000Z',
          is_ai_assisted: false,
          files: [],
          lines_added: 5,
          lines_deleted: 0,
        },
      ],
    };
    const result = computeQualityMetrics(inputs, RANGE);
    const totalUnmapped = (result.leadTimeUnmappedTimeSeries ?? []).reduce(
      (s, b) => s + b.value,
      0,
    );
    expect(totalUnmapped).toBe(1);
  });

  it('leadTimeMinByPrefix groups lead-time minutes by Conventional Commits prefix', () => {
    const inputs: QualityMetricsInputs = {
      ...INPUTS_WITH_COSTS,
      commits: [
        { ...INPUTS_WITH_COSTS.commits[0], hash: 'h-feat', subject: 'feat: add A' },
        {
          ...INPUTS_WITH_COSTS.commits[0],
          hash: 'h-fix',
          subject: 'fix: B',
          committed_at: '2026-04-20T11:30:00.000Z',
        },
      ],
      messages: [
        ...INPUTS_WITH_COSTS.messages,
        {
          uuid: 'u2',
          created_at: '2026-04-20T11:15:00.000Z',
          role: 'user',
          type: 'user',
          session_id: 's1',
        },
      ],
    };
    const result = computeQualityMetrics(inputs, RANGE);
    expect(result.leadTimeMinByPrefix?.prefixes).toEqual(expect.arrayContaining(['feat', 'fix']));
    const sumByPrefix = (p: string) =>
      (result.leadTimeMinByPrefix?.series ?? []).reduce((s, row) => s + (row.byPrefix[p] ?? 0), 0);
    expect(sumByPrefix('feat')).toBe(60); // 10:00 -> 11:00
    expect(sumByPrefix('fix')).toBe(15);  // 11:15 -> 11:30
  });
});
