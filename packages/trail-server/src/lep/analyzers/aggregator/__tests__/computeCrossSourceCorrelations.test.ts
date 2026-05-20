import type {
  CorrelationCommitFile,
  CorrelationSessionCommit,
  DoraReleaseInput,
  PrReviewFindingRow,
  PrReviewRow,
} from '@anytime-markdown/trail-db';

import {
  computeCrossSourceCorrelations,
  type CrossSourceInput,
} from '../computeCrossSourceCorrelations';

const NOW = '2026-05-20T00:00:00.000Z';

function review(over: Partial<PrReviewRow> = {}): PrReviewRow {
  return {
    reviewId: 'r1',
    repoName: 'widget',
    prNumber: 7,
    author: 'alice',
    state: 'CHANGES_REQUESTED',
    submittedAt: '2026-01-15T00:00:00.000Z',
    bodyHash: 'h',
    ...over,
  };
}
function sc(over: Partial<CorrelationSessionCommit>): CorrelationSessionCommit {
  return { sessionId: 's1', commitHash: 'h1', committedAt: '2026-01-10T00:00:00.000Z', repoName: 'widget', ...over };
}
function rel(over: Partial<DoraReleaseInput>): DoraReleaseInput {
  return { tag: 'v1', releasedAt: '2026-01-20T00:00:00.000Z', repoName: 'widget', ...over };
}
function finding(over: Partial<PrReviewFindingRow>): PrReviewFindingRow {
  return { findingId: 'r1#c0', reviewId: 'r1', filePath: 'src/a.ts', lineNumber: 1, severity: null, category: null, body: 'x', createdAt: NOW, ...over };
}
function cf(over: Partial<CorrelationCommitFile>): CorrelationCommitFile {
  return { commitHash: 'h1', filePath: 'src/a.ts', repoName: 'widget', ...over };
}

function run(over: Partial<CrossSourceInput>) {
  const input: CrossSourceInput = {
    reviews: [],
    findings: [],
    sessionCommits: [],
    releases: [],
    commitFiles: [],
    ...over,
  };
  return computeCrossSourceCorrelations(input, NOW);
}

describe('computeCrossSourceCorrelations', () => {
  it('returns [] for empty input', () => {
    expect(run({})).toEqual([]);
  });

  it('correlates review↔session within the time window before submission', () => {
    const rows = run({
      reviews: [review()],
      sessionCommits: [
        sc({ sessionId: 's1', committedAt: '2026-01-10T00:00:00.000Z' }), // 5d 前 → 相関
        sc({ sessionId: 's2', committedAt: '2025-12-01T00:00:00.000Z' }), // 45d 前 → 範囲外
        sc({ sessionId: 's3', committedAt: '2026-01-12T00:00:00.000Z', repoName: 'other' }), // 別 repo
      ],
    });
    expect(rows).toEqual([
      { correlationType: 'pr_review_session', repoName: 'widget', sourceAKind: 'pr_review', sourceAId: 'r1', sourceBKind: 'session', sourceBId: 's1', confidence: 'medium', computedAt: NOW },
    ]);
  });

  it('correlates review↔release within the window after submission', () => {
    const rows = run({
      reviews: [review()],
      releases: [
        rel({ tag: 'v1', releasedAt: '2026-01-20T00:00:00.000Z' }), // 5d 後 → 相関
        rel({ tag: 'v0', releasedAt: '2026-01-01T00:00:00.000Z' }), // 前 → なし
      ],
    });
    expect(rows).toEqual([
      { correlationType: 'pr_review_release', repoName: 'widget', sourceAKind: 'pr_review', sourceAId: 'r1', sourceBKind: 'release', sourceBId: 'v1', confidence: 'low', computedAt: NOW },
    ]);
  });

  it('correlates finding↔commit by file path within the same repo', () => {
    const rows = run({
      reviews: [review()],
      findings: [finding({ filePath: 'src/a.ts' })],
      commitFiles: [
        cf({ commitHash: 'h1', filePath: 'src/a.ts', repoName: 'widget' }), // 相関
        cf({ commitHash: 'h9', filePath: 'src/a.ts', repoName: 'other' }), // 別 repo
      ],
    });
    expect(rows).toEqual([
      { correlationType: 'pr_finding_commit', repoName: 'widget', sourceAKind: 'pr_finding', sourceAId: 'r1#c0', sourceBKind: 'commit', sourceBId: 'h1', confidence: 'medium', computedAt: NOW },
    ]);
  });

  it('dedups repeated session commits into one correlation', () => {
    const rows = run({
      reviews: [review()],
      sessionCommits: [
        sc({ sessionId: 's1', commitHash: 'h1', committedAt: '2026-01-10T00:00:00.000Z' }),
        sc({ sessionId: 's1', commitHash: 'h2', committedAt: '2026-01-11T00:00:00.000Z' }),
      ],
    });
    expect(rows.filter((r) => r.correlationType === 'pr_review_session')).toHaveLength(1);
  });

  it('emits all three correlation types sorted deterministically', () => {
    const rows = run({
      reviews: [review()],
      findings: [finding({})],
      sessionCommits: [sc({})],
      releases: [rel({})],
      commitFiles: [cf({})],
    });
    expect(rows.map((r) => r.correlationType)).toEqual([
      'pr_finding_commit',
      'pr_review_release',
      'pr_review_session',
    ]);
  });

  it('skips review with invalid submittedAt (NaN)', () => {
    const rows = run({
      reviews: [review({ submittedAt: 'not-a-date' })],
      sessionCommits: [sc({})],
      releases: [rel({})],
    });
    expect(rows).toEqual([]);
  });

  it('skips session commit with invalid committedAt (NaN)', () => {
    const rows = run({
      reviews: [review()],
      sessionCommits: [sc({ committedAt: 'bad-date' })],
    });
    expect(rows).toEqual([]);
  });

  it('skips release with invalid releasedAt (NaN)', () => {
    const rows = run({
      reviews: [review()],
      releases: [rel({ releasedAt: 'bad-date' })],
    });
    expect(rows).toEqual([]);
  });

  it('skips finding with empty filePath', () => {
    const rows = run({
      reviews: [review()],
      findings: [finding({ filePath: '' })],
      commitFiles: [cf({})],
    });
    expect(rows.filter((r) => r.correlationType === 'pr_finding_commit')).toEqual([]);
  });

  it('uses empty repoName when finding reviewId has no matching review', () => {
    // finding.reviewId が reviewsById にない場合 → repoName = ''
    const rows = run({
      reviews: [review({ reviewId: 'other' })],
      findings: [finding({ reviewId: 'ghost' })],
      commitFiles: [cf({ repoName: '' })], // repoName 空でフィルタ通過
    });
    // repoName='' の finding でも cf.repoName='' なら skip しない (条件が両方 falsy)
    expect(rows.filter((r) => r.correlationType === 'pr_finding_commit')).toHaveLength(1);
  });

  it('deduplicates review↔session when multiple commits from same session', () => {
    const rows = run({
      reviews: [review()],
      sessionCommits: [
        sc({ sessionId: 's1', commitHash: 'h1', committedAt: '2026-01-10T00:00:00.000Z' }),
        sc({ sessionId: 's1', commitHash: 'h2', committedAt: '2026-01-12T00:00:00.000Z' }),
      ],
    });
    // same correlationType|sourceAId|sourceBId → dedup to 1
    expect(rows.filter((r) => r.correlationType === 'pr_review_session')).toHaveLength(1);
  });

  it('excludes session commit after review submission', () => {
    const rows = run({
      reviews: [review({ submittedAt: '2026-01-15T00:00:00.000Z' })],
      sessionCommits: [
        sc({ committedAt: '2026-01-16T00:00:00.000Z' }), // after review → not correlated
      ],
    });
    expect(rows.filter((r) => r.correlationType === 'pr_review_session')).toHaveLength(0);
  });

  it('excludes release before review submission', () => {
    const rows = run({
      reviews: [review({ submittedAt: '2026-01-15T00:00:00.000Z' })],
      releases: [rel({ releasedAt: '2026-01-14T00:00:00.000Z' })], // before review → not correlated
    });
    expect(rows.filter((r) => r.correlationType === 'pr_review_release')).toHaveLength(0);
  });
});
