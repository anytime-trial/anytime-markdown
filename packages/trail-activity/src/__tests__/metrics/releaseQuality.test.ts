import { computeReleaseQualityTimeSeries } from '../../domain/metrics/releaseQuality';
import type { DateRange } from '../../domain/metrics/types';

const range: DateRange = { from: '2026-04-01T00:00:00.000Z', to: '2026-04-30T23:59:59.999Z' };

function makeRelease(tag_date: string) {
  return { tag_date };
}

function makeCommit(opts: { hash: string; subject: string; committed_at: string; files?: string[] }) {
  return { hash: opts.hash, subject: opts.subject, committed_at: opts.committed_at, files: opts.files ?? ['src/x.ts'] };
}

describe('computeReleaseQualityTimeSeries', () => {
  it('0 releases → empty array', () => {
    const result = computeReleaseQualityTimeSeries({ releases: [], commits: [] }, range, 'day');
    expect(result).toHaveLength(0);
  });

  it('release without post-deploy fix → succeeded', () => {
    const releases = [makeRelease('2026-04-10T00:00:00.000Z')];
    const commits = [
      makeCommit({ hash: 'c1', subject: 'feat: add X', committed_at: '2026-04-09T00:00:00.000Z', files: ['src/x.ts'] }),
    ];
    const result = computeReleaseQualityTimeSeries({ releases, commits }, range, 'day');
    const bucket = result.find((b) => b.bucketStart.startsWith('2026-04-10'));
    expect(bucket?.succeeded).toBe(1);
    expect(bucket?.failed).toBe(0);
  });

  it('release with post-deploy fix on same file within 168h → failed', () => {
    const releases = [makeRelease('2026-04-10T00:00:00.000Z')];
    const commits = [
      makeCommit({ hash: 'c1', subject: 'feat: add X', committed_at: '2026-04-09T00:00:00.000Z', files: ['src/x.ts'] }),
      makeCommit({ hash: 'c2', subject: 'fix: post-deploy bug', committed_at: '2026-04-12T00:00:00.000Z', files: ['src/x.ts'] }),
    ];
    const result = computeReleaseQualityTimeSeries({ releases, commits }, range, 'day');
    const bucket = result.find((b) => b.bucketStart.startsWith('2026-04-10'));
    expect(bucket?.failed).toBe(1);
    expect(bucket?.succeeded).toBe(0);
  });

  it('fix after 168h → succeeded', () => {
    const releases = [makeRelease('2026-04-10T00:00:00.000Z')];
    const commits = [
      makeCommit({ hash: 'c1', subject: 'feat: add X', committed_at: '2026-04-09T00:00:00.000Z', files: ['src/x.ts'] }),
      makeCommit({ hash: 'c2', subject: 'fix: late fix', committed_at: '2026-04-18T00:00:00.000Z', files: ['src/x.ts'] }),
    ];
    const result = computeReleaseQualityTimeSeries({ releases, commits }, range, 'day');
    const bucket = result.find((b) => b.bucketStart.startsWith('2026-04-10'));
    expect(bucket?.succeeded).toBe(1);
    expect(bucket?.failed).toBe(0);
  });

  it('fix on different file → succeeded', () => {
    const releases = [makeRelease('2026-04-10T00:00:00.000Z')];
    const commits = [
      makeCommit({ hash: 'c1', subject: 'feat: add X', committed_at: '2026-04-09T00:00:00.000Z', files: ['src/x.ts'] }),
      makeCommit({ hash: 'c2', subject: 'fix: unrelated', committed_at: '2026-04-12T00:00:00.000Z', files: ['src/y.ts'] }),
    ];
    const result = computeReleaseQualityTimeSeries({ releases, commits }, range, 'day');
    const bucket = result.find((b) => b.bucketStart.startsWith('2026-04-10'));
    expect(bucket?.succeeded).toBe(1);
    expect(bucket?.failed).toBe(0);
  });

  it('2 releases in same week → both counted', () => {
    const releases = [
      makeRelease('2026-04-07T00:00:00.000Z'),
      makeRelease('2026-04-09T00:00:00.000Z'),
    ];
    const commits = [
      makeCommit({ hash: 'c1', subject: 'feat: A', committed_at: '2026-04-06T00:00:00.000Z' }),
      makeCommit({ hash: 'c2', subject: 'feat: B', committed_at: '2026-04-08T00:00:00.000Z' }),
    ];
    const result = computeReleaseQualityTimeSeries({ releases, commits }, range, 'week');
    const total = result.reduce((s, b) => s + b.failed + b.succeeded, 0);
    expect(total).toBe(2);
  });

  it('release with no code files in assigned commits → succeeded (unmeasurable)', () => {
    const releases = [makeRelease('2026-04-10T00:00:00.000Z')];
    const commits = [
      makeCommit({ hash: 'c1', subject: 'docs: update README', committed_at: '2026-04-09T00:00:00.000Z', files: ['README.md'] }),
      makeCommit({ hash: 'c2', subject: 'fix: post-deploy', committed_at: '2026-04-12T00:00:00.000Z', files: ['README.md'] }),
    ];
    const result = computeReleaseQualityTimeSeries({ releases, commits }, range, 'day');
    const bucket = result.find((b) => b.bucketStart.startsWith('2026-04-10'));
    expect(bucket?.succeeded).toBe(1);
    expect(bucket?.failed).toBe(0);
  });
});
