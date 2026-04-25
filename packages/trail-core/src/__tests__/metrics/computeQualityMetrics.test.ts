import { computeQualityMetrics } from '../../domain/metrics/computeQualityMetrics';
import type { DateRange, QualityMetricsInputs } from '../../domain/metrics/computeQualityMetrics';

const range: DateRange = { from: '2026-04-01T00:00:00.000Z', to: '2026-04-30T23:59:59.999Z' };

function emptyInputs(): QualityMetricsInputs {
  return { releases: [], messages: [], messageCommits: [], commits: [], previousReleases: [], previousMessages: [], previousMessageCommits: [], previousCommits: [] };
}

describe('computeQualityMetrics', () => {
  it('empty inputs → all 5 metrics with sampleSize=0', () => {
    const result = computeQualityMetrics(emptyInputs(), range);
    expect(result.metrics.deploymentFrequency.sampleSize).toBe(0);
    expect(result.metrics.leadTimePerLoc.sampleSize).toBe(0);
    expect(result.metrics.tokensPerLoc.sampleSize).toBe(0);
    expect(result.metrics.aiFirstTrySuccessRate.sampleSize).toBe(0);
    expect(result.metrics.changeFailureRate.sampleSize).toBe(0);
  });

  it('returns 5 unmeasured metrics', () => {
    const result = computeQualityMetrics(emptyInputs(), range);
    expect(result.unmeasured.length).toBe(5);
    const ids = result.unmeasured.map((u) => u.id);
    expect(ids).toContain('meanTimeToRecovery');
    expect(ids).toContain('taskCompletionRate');
    expect(ids).toContain('aiQualityEfficiencyScore');
    expect(ids).toContain('recoveryRate');
    expect(ids).toContain('autonomyIndex');
  });

  it('previousRange is same length as range, just before', () => {
    const result = computeQualityMetrics(emptyInputs(), range);
    const fromMs = new Date(range.from).getTime();
    const toMs = new Date(range.to).getTime();
    const duration = toMs - fromMs;
    const prevFrom = new Date(result.previousRange.from).getTime();
    const prevTo = new Date(result.previousRange.to).getTime();
    expect(prevTo + 1).toBeCloseTo(fromMs, -3); // prevTo + 1ms ≈ from
    expect(prevTo - prevFrom).toBeCloseTo(duration, -3);
  });

  it('bucket=day when range <= 14 days', () => {
    const shortRange: DateRange = { from: '2026-04-01T00:00:00.000Z', to: '2026-04-14T23:59:59.999Z' };
    const result = computeQualityMetrics(emptyInputs(), shortRange);
    expect(result.bucket).toBe('day');
  });

  it('bucket=week when range >= 15 days', () => {
    const longRange: DateRange = { from: '2026-04-01T00:00:00.000Z', to: '2026-04-15T23:59:59.999Z' };
    const result = computeQualityMetrics(emptyInputs(), longRange);
    expect(result.bucket).toBe('week');
  });

  it('range is stored in result', () => {
    const result = computeQualityMetrics(emptyInputs(), range);
    expect(result.range).toEqual(range);
  });

  it('computes deployment frequency from releases', () => {
    const inputs: QualityMetricsInputs = {
      ...emptyInputs(),
      releases: [
        { id: 'r1', tag_date: '2026-04-10T00:00:00.000Z', commit_hashes: [] },
        { id: 'r2', tag_date: '2026-04-20T00:00:00.000Z', commit_hashes: [] },
      ],
    };
    const result = computeQualityMetrics(inputs, range);
    expect(result.metrics.deploymentFrequency.sampleSize).toBe(2);
    expect(result.metrics.deploymentFrequency.value).toBeGreaterThan(0);
  });

  it('computes leadTimePerLoc from message commits and commits', () => {
    const inputs: QualityMetricsInputs = {
      ...emptyInputs(),
      messages: [{ uuid: 'm0', created_at: '2026-04-10T00:00:00.000Z', role: 'user', type: 'text' }],
      messageCommits: [{ message_uuid: 'm0', commit_hash: 'abc123', detected_at: '2026-04-10T04:00:00.000Z', match_confidence: 'high' }],
      commits: [{ hash: 'abc123', subject: 'feat', committed_at: '2026-04-10T04:00:00.000Z', is_ai_assisted: true, files: [], lines_added: 80, lines_deleted: 20 }],
    };
    const result = computeQualityMetrics(inputs, range);
    expect(result.metrics.leadTimePerLoc.sampleSize).toBe(1);
    expect(result.metrics.leadTimePerLoc.value).toBeGreaterThan(0);
  });

  it('includes comparison when previous data provided', () => {
    const inputs: QualityMetricsInputs = {
      ...emptyInputs(),
      releases: [{ id: 'r1', tag_date: '2026-04-10T00:00:00.000Z', commit_hashes: [] }],
      previousReleases: [{ id: 'pr1', tag_date: '2026-03-10T00:00:00.000Z', commit_hashes: [] }],
    };
    const result = computeQualityMetrics(inputs, range);
    expect(result.metrics.deploymentFrequency.comparison).toBeDefined();
  });
});
