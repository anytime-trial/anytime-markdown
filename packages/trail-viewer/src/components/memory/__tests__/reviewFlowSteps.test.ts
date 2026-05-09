import { buildReviewFlowSteps } from '../reviewFlowSteps';
import type { MemoryReviewHistoryRow } from '../../../data/types';

const labels = {
  review: 'Review',
  findingLabel: 'Finding',
  addressed: 'Addressed',
  notAddressed: 'Not addressed',
};

function makeRow(overrides: Partial<MemoryReviewHistoryRow>): MemoryReviewHistoryRow {
  return {
    id: 'r1',
    reviewId: 'rev-1',
    title: 'Test Review',
    reviewedAt: '2026-01-01T00:00:00.000Z',
    targetFilePath: 'src/foo.ts',
    category: 'security',
    severity: 'warn',
    findingText: 'Potential XSS issue',
    addressedCommitSha: null,
    addressedAt: null,
    ...overrides,
  };
}

describe('buildReviewFlowSteps', () => {
  it('returns 3 steps', () => {
    const steps = buildReviewFlowSteps(makeRow({}), labels);
    expect(steps).toHaveLength(3);
  });

  it('first two steps are always completed', () => {
    const steps = buildReviewFlowSteps(makeRow({}), labels);
    expect(steps[0].completed).toBe(true);
    expect(steps[1].completed).toBe(true);
  });

  it('third step is not completed when not addressed', () => {
    const steps = buildReviewFlowSteps(makeRow({ addressedCommitSha: null }), labels);
    expect(steps[2].completed).toBe(false);
    expect(steps[2].label).toBe('Not addressed');
    expect(steps[2].detail).toBe('');
  });

  it('third step is completed when addressed', () => {
    const steps = buildReviewFlowSteps(
      makeRow({ addressedCommitSha: 'abc1234def', addressedAt: '2026-02-01T00:00:00.000Z' }),
      labels,
    );
    expect(steps[2].completed).toBe(true);
    expect(steps[2].label).toBe('Addressed');
    expect(steps[2].detail).toContain('abc1234');
    expect(steps[2].detail).toContain('2026-02-01');
  });

  it('review step detail includes title and date', () => {
    const steps = buildReviewFlowSteps(makeRow({}), labels);
    expect(steps[0].detail).toContain('Test Review');
    expect(steps[0].detail).toContain('2026-01-01');
  });

  it('finding step detail includes category and severity', () => {
    const steps = buildReviewFlowSteps(makeRow({}), labels);
    expect(steps[1].detail).toContain('security');
    expect(steps[1].detail).toContain('warn');
  });

  it('finding text is truncated to 80 chars', () => {
    const longText = 'x'.repeat(100);
    const steps = buildReviewFlowSteps(makeRow({ findingText: longText }), labels);
    expect(steps[1].detail.length).toBeLessThanOrEqual(100);
  });
});
