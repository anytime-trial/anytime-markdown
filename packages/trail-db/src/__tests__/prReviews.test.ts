import { createTestTrailDatabase } from './support/createTestDb';
import type { TrailDatabase, PrReviewUpsert } from '../TrailDatabase';

const REVIEW: PrReviewUpsert = {
  reviewId: '100',
  repoName: 'widget',
  prNumber: 7,
  author: 'alice',
  state: 'CHANGES_REQUESTED',
  submittedAt: '2026-01-10T00:00:00Z',
  body: 'fix please',
  bodyHash: 'hash-v1',
  comments: [
    { path: 'a.ts', line: 12, body: 'null check' },
    { path: 'b.ts', line: null, body: 'rename' },
  ],
};

const CREATED = '2026-05-20T00:00:00.000Z';

describe('TrailDatabase PR review (Step 4b-4c)', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });
  afterEach(() => db.close());

  it('round-trips upsertPrReview / getPrReviewDetail / getPrReviewBodyHash', () => {
    expect(db.getPrReviewBodyHash('100')).toBeNull();
    db.upsertPrReview(REVIEW);

    expect(db.getPrReviewBodyHash('100')).toBe('hash-v1');
    const detail = db.getPrReviewDetail('100');
    expect(detail).toEqual({
      reviewId: '100',
      repoName: 'widget',
      prNumber: 7,
      state: 'CHANGES_REQUESTED',
      body: 'fix please',
      comments: [
        { path: 'a.ts', line: 12, body: 'null check' },
        { path: 'b.ts', line: null, body: 'rename' },
      ],
    });
    expect(db.getPrReviews()).toEqual([
      { reviewId: '100', repoName: 'widget', prNumber: 7, author: 'alice', state: 'CHANGES_REQUESTED', submittedAt: '2026-01-10T00:00:00Z', bodyHash: 'hash-v1' },
    ]);
  });

  it('upsert replaces comments (idempotent)', () => {
    db.upsertPrReview(REVIEW);
    db.upsertPrReview({ ...REVIEW, bodyHash: 'hash-v2', comments: [{ path: 'c.ts', line: 1, body: 'only one now' }] });

    const detail = db.getPrReviewDetail('100');
    expect(detail?.comments).toEqual([{ path: 'c.ts', line: 1, body: 'only one now' }]);
    expect(db.getPrReviewBodyHash('100')).toBe('hash-v2');
    expect(db.getPrReviews()).toHaveLength(1);
  });

  it('rejects invalid review state (CHECK)', () => {
    expect(() => db.upsertPrReview({ ...REVIEW, state: 'MERGED' as never })).toThrow();
  });

  it('round-trips replacePrReviewFindings / getPrReviewFindings', () => {
    db.upsertPrReview(REVIEW);
    db.replacePrReviewFindings('100', [
      { findingId: '100#c0', reviewId: '100', filePath: 'a.ts', lineNumber: 12, severity: 'error', category: 'logic', body: 'null check', createdAt: CREATED },
      { findingId: '100#c1', reviewId: '100', filePath: 'b.ts', lineNumber: null, severity: null, category: null, body: 'rename', createdAt: CREATED },
    ]);

    const findings = db.getPrReviewFindings('100');
    expect(findings).toHaveLength(2);
    expect(findings[0]).toEqual({ findingId: '100#c0', reviewId: '100', filePath: 'a.ts', lineNumber: 12, severity: 'error', category: 'logic', body: 'null check', createdAt: CREATED });
    expect(findings[1].severity).toBeNull();

    // 洗い替え
    db.replacePrReviewFindings('100', []);
    expect(db.getPrReviewFindings('100')).toEqual([]);
  });

  it('rejects invalid finding severity (CHECK)', () => {
    db.upsertPrReview(REVIEW);
    expect(() =>
      db.replacePrReviewFindings('100', [
        { findingId: '100#x', reviewId: '100', filePath: '', lineNumber: null, severity: 'critical' as never, category: null, body: 'x', createdAt: CREATED },
      ]),
    ).toThrow();
  });
});
