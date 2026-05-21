import type { DoraCommitInput, DoraReleaseInput } from '@anytime-markdown/trail-db';

import { computeDoraMetrics } from '../computeDoraMetrics';

const NOW = '2026-05-19T00:00:00.000Z';

function rel(tag: string, releasedAt: string, repoName = 'repoA'): DoraReleaseInput {
  return { tag, releasedAt, repoName };
}
function commit(hash: string, committedAt: string, repoName = 'repoA'): DoraCommitInput {
  return { commitHash: hash, committedAt, repoName };
}

describe('computeDoraMetrics', () => {
  it('returns empty array for no releases', () => {
    expect(computeDoraMetrics([], [], NOW)).toEqual([]);
    // commits without releases も空 (deploy 先が無いため指標化できない)
    expect(computeDoraMetrics([], [commit('c1', '2026-01-01T00:00:00.000Z')], NOW)).toEqual([]);
  });

  it('counts deployment frequency per month per repo', () => {
    const releases = [
      rel('v1', '2026-01-10T00:00:00.000Z'),
      rel('v2', '2026-01-20T00:00:00.000Z'),
      rel('v3', '2026-02-05T00:00:00.000Z'),
    ];
    const rows = computeDoraMetrics(releases, [], NOW);
    expect(rows).toEqual([
      { repoName: 'repoA', period: '2026-01', deploymentFrequency: 2, leadTimeHours: null, computedAt: NOW },
      { repoName: 'repoA', period: '2026-02', deploymentFrequency: 1, leadTimeHours: null, computedAt: NOW },
    ]);
  });

  it('computes lead time median from commit to first containing release', () => {
    const releases = [
      rel('v1', '2026-01-10T00:00:00.000Z'),
      rel('v2', '2026-01-20T00:00:00.000Z'),
      rel('v3', '2026-02-05T00:00:00.000Z'),
    ];
    const commits = [
      commit('c1', '2026-01-08T00:00:00.000Z'), // → v1, 48h
      commit('c2', '2026-01-09T00:00:00.000Z'), // → v1, 24h
      commit('c3', '2026-02-04T00:00:00.000Z'), // → v3, 24h
    ];
    const rows = computeDoraMetrics(releases, commits, NOW);
    expect(rows).toEqual([
      { repoName: 'repoA', period: '2026-01', deploymentFrequency: 2, leadTimeHours: 36, computedAt: NOW },
      { repoName: 'repoA', period: '2026-02', deploymentFrequency: 1, leadTimeHours: 24, computedAt: NOW },
    ]);
  });

  it('excludes commits after the last release (not yet deployed)', () => {
    const releases = [rel('v1', '2026-01-10T00:00:00.000Z')];
    const commits = [
      commit('c1', '2026-01-09T00:00:00.000Z'), // → v1, 24h
      commit('c2', '2026-03-01T00:00:00.000Z'), // 最終 release より後 → 除外
    ];
    const rows = computeDoraMetrics(releases, commits, NOW);
    expect(rows).toEqual([
      { repoName: 'repoA', period: '2026-01', deploymentFrequency: 1, leadTimeHours: 24, computedAt: NOW },
    ]);
  });

  it('keeps repos separate and emits null lead time when a repo has no commits', () => {
    const releases = [
      rel('a1', '2026-01-10T00:00:00.000Z', 'repoA'),
      rel('b1', '2026-01-15T00:00:00.000Z', 'repoB'),
    ];
    const commits = [commit('c1', '2026-01-09T00:00:00.000Z', 'repoA')]; // repoB は commit なし
    const rows = computeDoraMetrics(releases, commits, NOW);
    expect(rows).toEqual([
      { repoName: 'repoA', period: '2026-01', deploymentFrequency: 1, leadTimeHours: 24, computedAt: NOW },
      { repoName: 'repoB', period: '2026-01', deploymentFrequency: 1, leadTimeHours: null, computedAt: NOW },
    ]);
  });

  it('handles ms-less timestamps and commit exactly at release time (lead 0)', () => {
    const releases = [rel('v1', '2026-01-10T00:00:00Z')];
    const commits = [commit('c1', '2026-01-10T00:00:00Z')]; // release と同時刻 → lead 0
    const rows = computeDoraMetrics(releases, commits, NOW);
    expect(rows).toEqual([
      { repoName: 'repoA', period: '2026-01', deploymentFrequency: 1, leadTimeHours: 0, computedAt: NOW },
    ]);
  });

  it('returns rows in deterministic repo→period order', () => {
    const releases = [
      rel('b2', '2026-03-01T00:00:00.000Z', 'repoB'),
      rel('a1', '2026-02-01T00:00:00.000Z', 'repoA'),
      rel('b1', '2026-01-01T00:00:00.000Z', 'repoB'),
    ];
    const rows = computeDoraMetrics(releases, [], NOW);
    expect(rows.map((r) => `${r.repoName}/${r.period}`)).toEqual([
      'repoA/2026-02',
      'repoB/2026-01',
      'repoB/2026-03',
    ]);
  });

  it('skips commits with invalid (NaN) committedAt', () => {
    const releases = [rel('v1', '2026-01-10T00:00:00.000Z')];
    const commits = [
      commit('c1', 'not-a-date'), // NaN → skip
      commit('c2', '2026-01-09T00:00:00.000Z'), // valid → 24h
    ];
    const rows = computeDoraMetrics(releases, commits, NOW);
    expect(rows[0].leadTimeHours).toBe(24); // only c2 counted
  });

  it('skips commits that produce negative lead time (commit after release)', () => {
    // firstReleaseAtOrAfter が release より前の commit を対象とする。
    // ただし「同一 release 時刻以上」で二分探索するため、committedAt > releasedAt の場合
    // idx = releases.length → 除外 (未 deploy コミット扱い)。
    // 負の lead time が発生するパスは実装上到達不可だが、
    // 既存 if (leadHours < 0) guard は commit = release より後のケースをガードするため
    // ここでは「release の後で committed」= 除外される ことを確認する。
    const releases = [rel('v1', '2026-01-10T00:00:00.000Z')];
    const commits = [commit('c1', '2026-01-11T00:00:00.000Z')]; // after release → excluded
    const rows = computeDoraMetrics(releases, commits, NOW);
    // c1 は最終 release より後 → idx >= sorted.length → skip → leadTimeHours = null
    expect(rows[0].leadTimeHours).toBeNull();
  });

  it('leadTimeHours is null when a period has no commits at all', () => {
    const releases = [
      rel('v1', '2026-01-10T00:00:00.000Z'),
      rel('v2', '2026-02-10T00:00:00.000Z'),
    ];
    // commit は 2026-01 の v1 のみ
    const commits = [commit('c1', '2026-01-09T00:00:00.000Z')];
    const rows = computeDoraMetrics(releases, commits, NOW);
    const feb = rows.find((r) => r.period === '2026-02');
    expect(feb?.leadTimeHours).toBeNull();
  });
});
