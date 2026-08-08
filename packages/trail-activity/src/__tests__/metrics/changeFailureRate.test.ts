import { computeChangeFailureRate } from '../../domain/metrics/changeFailureRate';
import type { DateRange } from '../../domain/metrics/types';

const range: DateRange = { from: '2026-04-01T00:00:00.000Z', to: '2026-04-30T23:59:59.999Z' };
const prevRange: DateRange = { from: '2026-03-01T00:00:00.000Z', to: '2026-03-31T23:59:59.999Z' };

function makeRelease(id: string, tag_date: string, commit_hashes: string[]) {
  return { id, tag_date, commit_hashes };
}

describe('computeChangeFailureRate', () => {
  it('0 releases → value=0, sampleSize=0', () => {
    const result = computeChangeFailureRate({ releases: [], commits: [] }, range, prevRange, 'week');
    expect(result.value).toBe(0);
    expect(result.sampleSize).toBe(0);
    expect(result.unit).toBe('percent');
  });

  function makeCommit(opts: {
    hash: string;
    subject: string;
    committed_at: string;
    files?: string[];
  }) {
    return {
      hash: opts.hash,
      subject: opts.subject,
      committed_at: opts.committed_at,
      files: opts.files ?? ['src/x.ts'],
    };
  }

  it('リリース前に fix で直しきった場合は成功', () => {
    const releases = [makeRelease('r1', '2026-04-10T00:00:00.000Z', ['c1', 'c2'])];
    const commits = [
      makeCommit({ hash: 'c1', subject: 'feat: add X', committed_at: '2026-04-09T00:00:00.000Z' }),
      makeCommit({ hash: 'c2', subject: 'fix: pre-release fix', committed_at: '2026-04-09T12:00:00.000Z' }),
    ];
    const result = computeChangeFailureRate({ releases, commits }, range, prevRange, 'day');
    expect(result.value).toBeCloseTo(0, 1);
    expect(result.sampleSize).toBe(1);
  });

  it('リリース後 168h 以内に同一ファイル fix → 失敗', () => {
    const releases = [makeRelease('r1', '2026-04-10T00:00:00.000Z', ['c1'])];
    const commits = [
      makeCommit({ hash: 'c1', subject: 'feat: add X', committed_at: '2026-04-09T00:00:00.000Z', files: ['src/x.ts'] }),
      makeCommit({ hash: 'c2', subject: 'fix: post-release fix', committed_at: '2026-04-12T00:00:00.000Z', files: ['src/x.ts'] }),
    ];
    const result = computeChangeFailureRate({ releases, commits }, range, prevRange, 'day');
    expect(result.value).toBeCloseTo(100, 1);
    expect(result.sampleSize).toBe(1);
  });

  it('リリース後 168h 以内 fix だがファイル重複なし → 成功', () => {
    const releases = [makeRelease('r1', '2026-04-10T00:00:00.000Z', ['c1'])];
    const commits = [
      makeCommit({ hash: 'c1', subject: 'feat: add X', committed_at: '2026-04-09T00:00:00.000Z', files: ['src/x.ts'] }),
      makeCommit({ hash: 'c2', subject: 'fix: unrelated', committed_at: '2026-04-12T00:00:00.000Z', files: ['src/y.ts'] }),
    ];
    const result = computeChangeFailureRate({ releases, commits }, range, prevRange, 'day');
    expect(result.value).toBeCloseTo(0, 1);
    expect(result.sampleSize).toBe(1);
  });

  it('リリース後 168h 超過の fix → 成功', () => {
    const releases = [makeRelease('r1', '2026-04-10T00:00:00.000Z', ['c1'])];
    const commits = [
      makeCommit({ hash: 'c1', subject: 'feat: add X', committed_at: '2026-04-09T00:00:00.000Z' }),
      makeCommit({ hash: 'c2', subject: 'fix: too late', committed_at: '2026-04-18T00:00:00.000Z' }),
    ];
    const result = computeChangeFailureRate({ releases, commits }, range, prevRange, 'day');
    expect(result.value).toBeCloseTo(0, 1);
  });

  it('files が全て空のリリースは sample size から除外', () => {
    const releases = [
      makeRelease('r1', '2026-04-10T00:00:00.000Z', ['c1']),
      makeRelease('r2', '2026-04-20T00:00:00.000Z', ['c2']),
    ];
    const commits = [
      makeCommit({ hash: 'c1', subject: 'feat: add X', committed_at: '2026-04-09T00:00:00.000Z', files: [] }),
      makeCommit({ hash: 'c2', subject: 'feat: add Y', committed_at: '2026-04-19T00:00:00.000Z', files: ['src/y.ts'] }),
    ];
    const result = computeChangeFailureRate({ releases, commits }, range, prevRange, 'day');
    expect(result.sampleSize).toBe(1); // r1 は除外、r2 のみ
  });

  it('連続 2 リリース、T1 後 / T2 前の fix → T1 のみ失敗', () => {
    const releases = [
      makeRelease('r1', '2026-04-10T00:00:00.000Z', ['c1']),
      makeRelease('r2', '2026-04-15T00:00:00.000Z', ['c3']),
    ];
    const commits = [
      makeCommit({ hash: 'c1', subject: 'feat: A', committed_at: '2026-04-09T00:00:00.000Z', files: ['src/a.ts'] }),
      makeCommit({ hash: 'c2', subject: 'fix: A bug', committed_at: '2026-04-12T00:00:00.000Z', files: ['src/a.ts'] }),
      makeCommit({ hash: 'c3', subject: 'feat: B', committed_at: '2026-04-14T00:00:00.000Z', files: ['src/b.ts'] }),
    ];
    const result = computeChangeFailureRate({ releases, commits }, range, prevRange, 'day');
    expect(result.value).toBeCloseTo(50, 1); // r1 失敗、r2 成功 → 1/2
    expect(result.sampleSize).toBe(2);
  });

  it('fix のコードファイルがすべて非コード（md など）→ 失敗判定しない', () => {
    const releases = [makeRelease('r1', '2026-04-10T00:00:00.000Z', ['c1'])];
    const commits = [
      makeCommit({ hash: 'c1', subject: 'feat: add X', committed_at: '2026-04-09T00:00:00.000Z', files: ['src/x.ts'] }),
      makeCommit({ hash: 'c2', subject: 'fix: typo', committed_at: '2026-04-12T00:00:00.000Z', files: ['README.md'] }),
    ];
    const result = computeChangeFailureRate({ releases, commits }, range, prevRange, 'day');
    expect(result.value).toBeCloseTo(0, 1);
  });
});
