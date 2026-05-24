/**
 * Characterization tests — DORA / PR review / cross-source correlations
 *
 * Covers:
 *   - getDoraReleases
 *   - getDoraCommits
 *   - replaceDoraMetrics
 *   - upsertPrReview / getPrReviewBodyHash / getPrReviewDetail / getPrReviews
 *   - replacePrReviewFindings / getPrReviewFindings
 *   - getCorrelationSessionCommits / getCorrelationCommitFiles
 *   - replaceCrossSourceCorrelations / getCrossSourceCorrelations
 */

import { createTestTrailDatabase } from './support/createTestDb';
import type { TrailDatabase } from '../TrailDatabase';
import type {
  DoraMetricRow,
  PrReviewUpsert,
  PrReviewFindingRow,
  CrossSourceCorrelationRow,
} from '../TrailDatabase';

type RawDb = {
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
};

function inner(db: TrailDatabase): RawDb {
  return (db as unknown as { db: RawDb }).db;
}

/** Phase H: releases/sessions/session_commits/commit_files は repo_name を撤去済。repo_id を repos 経由で解決する。 */
function repoId(db: TrailDatabase, repoName: string): number {
  return (db as unknown as { repoIdForName(n: string): number }).repoIdForName(repoName);
}

function insertRelease(db: TrailDatabase, tag: string, releasedAt: string | null, repoName = 'test-repo'): void {
  inner(db).run(
    `INSERT OR IGNORE INTO releases (tag, released_at, repo_id) VALUES (?, ?, ?)`,
    [tag, releasedAt, repoId(db, repoName)],
  );
}

function insertSessionWithCommit(
  db: TrailDatabase,
  sessionId: string,
  commitHash: string,
  committedAt: string,
  repoName = 'test-repo',
): void {
  inner(db).run(
    `INSERT OR IGNORE INTO sessions (id, slug, repo_id, version, entrypoint, model,
       start_time, end_time, message_count, file_path, file_size, imported_at, source)
     VALUES (?, ?, ?, '', '', '', '2026-01-01T00:00:00.000Z', '2026-01-01T01:00:00.000Z', 0, '', 0, '2026-01-01T01:00:00.000Z', 'claude_code')`,
    [sessionId, sessionId, repoId(db, repoName)],
  );
  inner(db).run(
    `INSERT OR IGNORE INTO session_commits
       (session_id, commit_hash, commit_message, author, committed_at, is_ai_assisted,
        files_changed, lines_added, lines_deleted, repo_id)
     VALUES (?, ?, 'test commit', 'author', ?, 0, 0, 0, 0, ?)`,
    [sessionId, commitHash, committedAt, repoId(db, repoName)],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DORA
// ─────────────────────────────────────────────────────────────────────────────

describe('TrailDatabase.getDoraReleases', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty array when no releases exist', () => {
    expect(db.getDoraReleases()).toEqual([]);
  });

  it('excludes releases with NULL released_at', () => {
    insertRelease(db, 'v0.0.1', null);
    expect(db.getDoraReleases()).toEqual([]);
  });

  it('excludes releases with empty released_at', () => {
    insertRelease(db, 'v0.0.2', '');
    expect(db.getDoraReleases()).toEqual([]);
  });

  it('returns releases with valid released_at', () => {
    insertRelease(db, 'v1.0.0', '2026-01-01T00:00:00.000Z');
    insertRelease(db, 'v1.1.0', '2026-02-01T00:00:00.000Z');
    const rows = db.getDoraReleases();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ tag: 'v1.0.0', releasedAt: '2026-01-01T00:00:00.000Z', repoName: 'test-repo' });
    expect(rows[1]).toMatchObject({ tag: 'v1.1.0', releasedAt: '2026-02-01T00:00:00.000Z' });
  });
});

describe('TrailDatabase.getDoraCommits', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty array when no session_commits exist', () => {
    expect(db.getDoraCommits()).toEqual([]);
  });

  it('deduplicates commits across sessions', () => {
    insertSessionWithCommit(db, 's1', 'abc123', '2026-01-15T10:00:00.000Z');
    insertSessionWithCommit(db, 's2', 'abc123', '2026-01-15T10:00:00.000Z');
    const rows = db.getDoraCommits();
    // same commit_hash+repo_name → deduplicated to 1 row
    const abc = rows.filter(r => r.commitHash === 'abc123');
    expect(abc).toHaveLength(1);
  });

  it('excludes commits with null committed_at', () => {
    inner(db).run(
      `INSERT OR IGNORE INTO sessions (id, slug, repo_id, version, entrypoint, model,
         start_time, end_time, message_count, file_path, file_size, imported_at, source)
       VALUES ('sx', 'sx', ${repoId(db, 'repo')}, '', '', '', '2026-01-01T00:00:00.000Z', '2026-01-01T01:00:00.000Z', 0, '', 0, '2026-01-01T01:00:00.000Z', 'claude_code')`,
      [],
    );
    inner(db).run(
      `INSERT OR IGNORE INTO session_commits
         (session_id, commit_hash, commit_message, author, committed_at, is_ai_assisted,
          files_changed, lines_added, lines_deleted, repo_id)
       VALUES ('sx', 'nullhash', 'test', 'a', NULL, 0, 0, 0, 0, ${repoId(db, 'repo')})`,
    );
    const rows = db.getDoraCommits();
    expect(rows.filter(r => r.commitHash === 'nullhash')).toHaveLength(0);
  });

  it('returns commit rows ordered by committed_at', () => {
    insertSessionWithCommit(db, 's1', 'hash1', '2026-01-20T00:00:00.000Z');
    insertSessionWithCommit(db, 's2', 'hash2', '2026-01-10T00:00:00.000Z');
    const rows = db.getDoraCommits();
    const ts = rows.map(r => r.committedAt);
    expect(ts[0] <= ts[ts.length - 1]).toBe(true);
  });
});

describe('TrailDatabase.replaceDoraMetrics', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('replaces all dora_metrics rows (wash-away)', () => {
    const batch1: DoraMetricRow[] = [
      { repoName: 'repo', period: '2026-01', deploymentFrequency: 2, leadTimeHours: 24, computedAt: '2026-02-01T00:00:00.000Z' },
    ];
    db.replaceDoraMetrics(batch1);
    const batch2: DoraMetricRow[] = [
      { repoName: 'repo', period: '2026-02', deploymentFrequency: 5, leadTimeHours: null, computedAt: '2026-03-01T00:00:00.000Z' },
    ];
    db.replaceDoraMetrics(batch2);
    // After second replace, only batch2 should remain
    const result = (db as unknown as { db: { exec: (sql: string) => Array<{ values: unknown[][] }> } })
      .db.exec('SELECT period, deployment_frequency FROM dora_metrics ORDER BY period');
    const vals = result[0]?.values ?? [];
    expect(vals).toHaveLength(1);
    expect(vals[0][0]).toBe('2026-02');
    expect(vals[0][1]).toBe(5);
  });

  it('no-op with empty array clears the table', () => {
    const row: DoraMetricRow = { repoName: 'repo', period: '2026-01', deploymentFrequency: 1, leadTimeHours: 10, computedAt: '2026-02-01T00:00:00.000Z' };
    db.replaceDoraMetrics([row]);
    db.replaceDoraMetrics([]);
    const result = (db as unknown as { db: { exec: (sql: string) => Array<{ values: unknown[][] }> } })
      .db.exec('SELECT COUNT(*) FROM dora_metrics');
    expect(result[0]?.values[0]?.[0]).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PR Review
// ─────────────────────────────────────────────────────────────────────────────

const makeReview = (overrides: Partial<PrReviewUpsert> = {}): PrReviewUpsert => ({
  reviewId: 'rev-001',
  repoName: 'test-repo',
  prNumber: 42,
  author: 'alice',
  state: 'APPROVED',
  submittedAt: '2026-05-01T10:00:00.000Z',
  body: 'LGTM',
  bodyHash: 'hash001',
  comments: [],
  ...overrides,
});

describe('TrailDatabase.getPrReviewBodyHash', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns null when review does not exist', () => {
    expect(db.getPrReviewBodyHash('nonexistent')).toBeNull();
  });

  it('returns body_hash after upsert', () => {
    db.upsertPrReview(makeReview({ reviewId: 'rev-001', bodyHash: 'abc123' }));
    expect(db.getPrReviewBodyHash('rev-001')).toBe('abc123');
  });
});

describe('TrailDatabase.upsertPrReview', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('inserts a review with no comments', () => {
    db.upsertPrReview(makeReview({ comments: [] }));
    expect(db.getPrReviewBodyHash('rev-001')).toBe('hash001');
  });

  it('inserts a review with multiple comments', () => {
    db.upsertPrReview(makeReview({
      reviewId: 'rev-002',
      comments: [
        { path: 'src/foo.ts', line: 10, body: 'fix this' },
        { path: 'src/bar.ts', line: null, body: 'general comment' },
      ],
    }));
    const detail = db.getPrReviewDetail('rev-002');
    expect(detail).not.toBeNull();
    expect(detail!.comments).toHaveLength(2);
    expect(detail!.comments[0].path).toBe('src/foo.ts');
  });

  it('replaces comments on re-upsert (idempotent)', () => {
    db.upsertPrReview(makeReview({
      reviewId: 'rev-003',
      comments: [{ path: 'a.ts', line: 1, body: 'old' }],
    }));
    db.upsertPrReview(makeReview({
      reviewId: 'rev-003',
      bodyHash: 'newhash',
      comments: [
        { path: 'b.ts', line: 2, body: 'new1' },
        { path: 'c.ts', line: 3, body: 'new2' },
      ],
    }));
    const detail = db.getPrReviewDetail('rev-003');
    expect(detail!.comments).toHaveLength(2);
    expect(db.getPrReviewBodyHash('rev-003')).toBe('newhash');
  });
});

describe('TrailDatabase.getPrReviewDetail', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns null for unknown reviewId', () => {
    expect(db.getPrReviewDetail('unknown')).toBeNull();
  });

  it('returns full detail including repo_name, pr_number, state, body', () => {
    db.upsertPrReview(makeReview({
      reviewId: 'rev-detail',
      repoName: 'my-repo',
      prNumber: 99,
      state: 'CHANGES_REQUESTED',
      body: 'Please fix',
      comments: [{ path: 'index.ts', line: 5, body: 'nit' }],
    }));
    const detail = db.getPrReviewDetail('rev-detail');
    expect(detail).not.toBeNull();
    expect(detail!.reviewId).toBe('rev-detail');
    expect(detail!.repoName).toBe('my-repo');
    expect(detail!.prNumber).toBe(99);
    expect(detail!.state).toBe('CHANGES_REQUESTED');
    expect(detail!.body).toBe('Please fix');
    expect(detail!.comments[0]).toMatchObject({ path: 'index.ts', line: 5, body: 'nit' });
  });
});

describe('TrailDatabase.getPrReviews', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty array when no reviews', () => {
    expect(db.getPrReviews()).toEqual([]);
  });

  it('returns all reviews ordered by submitted_at', () => {
    db.upsertPrReview(makeReview({ reviewId: 'r1', submittedAt: '2026-04-01T00:00:00.000Z', bodyHash: 'h1' }));
    db.upsertPrReview(makeReview({ reviewId: 'r2', submittedAt: '2026-05-01T00:00:00.000Z', bodyHash: 'h2' }));
    const reviews = db.getPrReviews();
    expect(reviews).toHaveLength(2);
    expect(reviews[0].reviewId).toBe('r1');
    expect(reviews[1].reviewId).toBe('r2');
    expect(reviews[0]).toHaveProperty('repoName');
    expect(reviews[0]).toHaveProperty('prNumber');
  });
});

describe('TrailDatabase.replacePrReviewFindings / getPrReviewFindings', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  const makeFindings = (reviewId: string): PrReviewFindingRow[] => [
    {
      findingId: `${reviewId}-f1`,
      reviewId,
      filePath: 'src/foo.ts',
      lineNumber: 10,
      severity: 'error',
      category: 'logic',
      body: 'Null pointer risk',
      createdAt: '2026-05-01T00:00:00.000Z',
    },
    {
      findingId: `${reviewId}-f2`,
      reviewId,
      filePath: 'src/bar.ts',
      lineNumber: null,
      severity: 'warn',
      category: null,
      body: 'Consider using const',
      createdAt: '2026-05-01T00:00:00.000Z',
    },
  ];

  it('getPrReviewFindings returns empty array before any findings', () => {
    expect(db.getPrReviewFindings()).toEqual([]);
    expect(db.getPrReviewFindings('any')).toEqual([]);
  });

  it('replaces findings and retrieves them', () => {
    db.replacePrReviewFindings('rev-f1', makeFindings('rev-f1'));
    const all = db.getPrReviewFindings();
    expect(all).toHaveLength(2);
    expect(all[0].findingId).toBe('rev-f1-f1');
    expect(all[0].severity).toBe('error');
    expect(all[1].lineNumber).toBeNull();
  });

  it('filters by reviewId', () => {
    db.replacePrReviewFindings('rev-a', makeFindings('rev-a'));
    db.replacePrReviewFindings('rev-b', makeFindings('rev-b'));
    const forA = db.getPrReviewFindings('rev-a');
    expect(forA).toHaveLength(2);
    expect(forA.every(f => f.reviewId === 'rev-a')).toBe(true);
  });

  it('replaces (wash-away) on second call for same reviewId', () => {
    db.replacePrReviewFindings('rev-c', makeFindings('rev-c'));
    const newFindings: PrReviewFindingRow[] = [{
      findingId: 'rev-c-new',
      reviewId: 'rev-c',
      filePath: 'new.ts',
      lineNumber: 1,
      severity: 'info',
      category: 'perf',
      body: 'Minor',
      createdAt: '2026-05-02T00:00:00.000Z',
    }];
    db.replacePrReviewFindings('rev-c', newFindings);
    const findings = db.getPrReviewFindings('rev-c');
    expect(findings).toHaveLength(1);
    expect(findings[0].findingId).toBe('rev-c-new');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-source correlations
// ─────────────────────────────────────────────────────────────────────────────

describe('TrailDatabase.getCorrelationSessionCommits', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty array when no session_commits', () => {
    expect(db.getCorrelationSessionCommits()).toEqual([]);
  });

  it('returns only commits with valid committed_at', () => {
    insertSessionWithCommit(db, 's1', 'validhash', '2026-01-01T12:00:00.000Z');
    const rows = db.getCorrelationSessionCommits();
    expect(rows.some(r => r.commitHash === 'validhash')).toBe(true);
  });

  it('filters by sinceCommittedAt', () => {
    insertSessionWithCommit(db, 's1', 'oldhash', '2026-01-01T00:00:00.000Z');
    insertSessionWithCommit(db, 's2', 'newhash', '2026-06-01T00:00:00.000Z');
    const rows = db.getCorrelationSessionCommits('2026-03-01T00:00:00.000Z');
    expect(rows.some(r => r.commitHash === 'newhash')).toBe(true);
    expect(rows.some(r => r.commitHash === 'oldhash')).toBe(false);
  });
});

describe('TrailDatabase.getCorrelationCommitFiles', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty array for empty filePaths input', () => {
    expect(db.getCorrelationCommitFiles([])).toEqual([]);
  });

  it('returns empty array when no commit_files match', () => {
    expect(db.getCorrelationCommitFiles(['nonexistent.ts'])).toEqual([]);
  });

  it('returns matching commit_files rows', () => {
    inner(db).run(
      `INSERT OR IGNORE INTO commit_files (commit_hash, file_path, repo_id) VALUES (?, ?, ?)`,
      ['abcdef', 'src/foo.ts', repoId(db, 'test-repo')],
    );
    const rows = db.getCorrelationCommitFiles(['src/foo.ts']);
    expect(rows).toHaveLength(1);
    expect(rows[0].commitHash).toBe('abcdef');
    expect(rows[0].filePath).toBe('src/foo.ts');
  });

  it('filters to only requested filePaths', () => {
    inner(db).run(
      `INSERT OR IGNORE INTO commit_files (commit_hash, file_path, repo_id) VALUES (?, ?, ?)`,
      ['hash1', 'src/a.ts', repoId(db, 'repo')],
    );
    inner(db).run(
      `INSERT OR IGNORE INTO commit_files (commit_hash, file_path, repo_id) VALUES (?, ?, ?)`,
      ['hash2', 'src/b.ts', repoId(db, 'repo')],
    );
    const rows = db.getCorrelationCommitFiles(['src/a.ts']);
    expect(rows.every(r => r.filePath === 'src/a.ts')).toBe(true);
  });
});

describe('TrailDatabase.replaceCrossSourceCorrelations / getCrossSourceCorrelations', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  const makeRow = (overrides: Partial<CrossSourceCorrelationRow> = {}): CrossSourceCorrelationRow => ({
    correlationType: 'pr_review_session',
    repoName: 'test-repo',
    sourceAKind: 'pr_review',
    sourceAId: 'rev-001',
    sourceBKind: 'session',
    sourceBId: 'sess-001',
    confidence: 'high',
    computedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  });

  it('getCrossSourceCorrelations returns empty array before any data', () => {
    expect(db.getCrossSourceCorrelations()).toEqual([]);
  });

  it('inserts and retrieves correlations', () => {
    db.replaceCrossSourceCorrelations([makeRow()]);
    const rows = db.getCrossSourceCorrelations();
    expect(rows).toHaveLength(1);
    expect(rows[0].correlationType).toBe('pr_review_session');
    expect(rows[0].confidence).toBe('high');
  });

  it('replaces all rows on second call (wash-away)', () => {
    db.replaceCrossSourceCorrelations([makeRow({ sourceAId: 'old-rev' })]);
    db.replaceCrossSourceCorrelations([
      makeRow({ sourceAId: 'new-rev1' }),
      makeRow({ sourceAId: 'new-rev2', confidence: 'low' }),
    ]);
    const rows = db.getCrossSourceCorrelations();
    expect(rows).toHaveLength(2);
    expect(rows.every(r => r.sourceAId !== 'old-rev')).toBe(true);
  });

  it('clears table when called with empty array', () => {
    db.replaceCrossSourceCorrelations([makeRow()]);
    db.replaceCrossSourceCorrelations([]);
    expect(db.getCrossSourceCorrelations()).toEqual([]);
  });
});
