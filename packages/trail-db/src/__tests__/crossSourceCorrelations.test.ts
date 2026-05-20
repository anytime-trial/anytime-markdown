import { createTestTrailDatabase } from './support/createTestDb';
import type { TrailDatabase, CrossSourceCorrelationRow } from '../TrailDatabase';

const NOW = '2026-05-20T00:00:00.000Z';

const ROW: CrossSourceCorrelationRow = {
  correlationType: 'pr_review_session',
  repoName: 'widget',
  sourceAKind: 'pr_review',
  sourceAId: 'r1',
  sourceBKind: 'session',
  sourceBId: 's1',
  confidence: 'medium',
  computedAt: NOW,
};

describe('TrailDatabase cross-source correlations (Step 4d)', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });
  afterEach(() => db.close());

  it('returns [] for correlation reads on an empty DB', () => {
    expect(db.getCorrelationSessionCommits()).toEqual([]);
    expect(db.getCorrelationCommitFiles([])).toEqual([]);
    expect(db.getCorrelationCommitFiles(['src/a.ts'])).toEqual([]);
    expect(db.getCrossSourceCorrelations()).toEqual([]);
  });

  it('round-trips replaceCrossSourceCorrelations / getCrossSourceCorrelations (wash-away)', () => {
    db.replaceCrossSourceCorrelations([
      ROW,
      { ...ROW, correlationType: 'pr_finding_commit', sourceAKind: 'pr_finding', sourceAId: 'r1#c0', sourceBKind: 'commit', sourceBId: 'h1' },
    ]);
    const rows = db.getCrossSourceCorrelations();
    expect(rows).toHaveLength(2);
    expect(rows[0].correlationType).toBe('pr_finding_commit'); // sorted

    db.replaceCrossSourceCorrelations([]);
    expect(db.getCrossSourceCorrelations()).toEqual([]);
  });

  it('enforces correlation_type / confidence / source kind CHECK constraints', () => {
    expect(() => db.replaceCrossSourceCorrelations([{ ...ROW, correlationType: 'bogus' as never }])).toThrow();
    expect(() => db.replaceCrossSourceCorrelations([{ ...ROW, confidence: 'certain' as never }])).toThrow();
    expect(() => db.replaceCrossSourceCorrelations([{ ...ROW, sourceAKind: 'mystery' as never }])).toThrow();
    expect(() => db.replaceCrossSourceCorrelations([{ ...ROW, sourceBKind: 'mystery' as never }])).toThrow();
  });
});
