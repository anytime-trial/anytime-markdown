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

  it('returns 3 unmeasured metrics (MTTR and TCR are now measured)', () => {
    const result = computeQualityMetrics(emptyInputs(), range);
    expect(result.unmeasured.length).toBe(3);
    const ids = result.unmeasured.map((u) => u.id);
    expect(ids).toContain('aiQualityEfficiencyScore');
    expect(ids).toContain('recoveryRate');
    expect(ids).toContain('autonomyIndex');
    expect(result.metrics.meanTimeToRecovery.id).toBe('meanTimeToRecovery');
    expect(result.metrics.taskCompletionRate.id).toBe('taskCompletionRate');
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

  it('bucket=day when range <= 31 days (covers 7d/30d periods)', () => {
    const sevenDays: DateRange = { from: '2026-04-01T00:00:00.000Z', to: '2026-04-08T00:00:00.000Z' };
    expect(computeQualityMetrics(emptyInputs(), sevenDays).bucket).toBe('day');

    const thirtyDays: DateRange = { from: '2026-03-01T00:00:00.000Z', to: '2026-03-31T00:00:00.000Z' };
    expect(computeQualityMetrics(emptyInputs(), thirtyDays).bucket).toBe('day');
  });

  it('bucket=week when range > 31 days', () => {
    const ninetyDays: DateRange = { from: '2026-01-01T00:00:00.000Z', to: '2026-04-01T00:00:00.000Z' };
    expect(computeQualityMetrics(emptyInputs(), ninetyDays).bucket).toBe('week');
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

  it('computes leadTimePerLoc from messages and commits scoped by session', () => {
    const inputs: QualityMetricsInputs = {
      ...emptyInputs(),
      messages: [{ uuid: 'm0', created_at: '2026-04-10T00:00:00.000Z', role: 'user', type: 'text', session_id: 's1' }],
      commits: [{ hash: 'abc123', subject: 'feat', committed_at: '2026-04-10T04:00:00.000Z', is_ai_assisted: true, files: [], session_id: 's1', lines_added: 80, lines_deleted: 20 }],
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
