import { classifyCommitType, buildReleaseFromGitData } from '../releaseResolver';
import type { ReleaseGitData } from '../releaseResolver';

describe('classifyCommitType', () => {
  it('feat コミットを分類する', () => {
    expect(classifyCommitType('feat: add new feature')).toBe('feat');
    expect(classifyCommitType('feat(trail): add releases')).toBe('feat');
  });

  it('fix コミットを分類する', () => {
    expect(classifyCommitType('fix: resolve bug')).toBe('fix');
    expect(classifyCommitType('fix(web-app): layout issue')).toBe('fix');
  });

  it('refactor コミットを分類する', () => {
    expect(classifyCommitType('refactor: clean up code')).toBe('refactor');
  });

  it('test コミットを分類する', () => {
    expect(classifyCommitType('test: add unit tests')).toBe('test');
  });

  it('その他のプレフィックスは other を返す', () => {
    expect(classifyCommitType('perf: optimize query')).toBe('other');
    expect(classifyCommitType('ci: update pipeline')).toBe('other');
    expect(classifyCommitType('docs: update README')).toBe('other');
  });

  it('Conventional Commits 形式でない場合は other を返す', () => {
    expect(classifyCommitType('Merge branch feature into develop')).toBe('other');
    expect(classifyCommitType('release: v0.11.0')).toBe('other');
  });
});

describe('buildReleaseFromGitData', () => {
  it('git データから TrailRelease を構築する', () => {
    const data: ReleaseGitData = {
      tag: 'v0.11.0',
      prevTag: 'v0.10.4',
      releasedAt: '2026-04-11T01:29:50.000Z',
      prevReleasedAt: '2026-04-09T15:12:09.000Z',
      repoName: 'anytime-markdown',
      packageTags: ['trail-v0.5.1', 'graph-v0.1.2'],
      commitSubjects: [
        'feat: add releases tab',
        'fix: resolve layout bug',
        'refactor: clean up code',
        'test: add unit tests',
        'docs: update README',
      ],
      filesChanged: 10,
      linesAdded: 500,
      linesDeleted: 200,
      affectedPackages: ['trail-core', 'trail-viewer'],
    };

    const release = buildReleaseFromGitData(data);
    expect(release.tag).toBe('v0.11.0');
    expect(release.commitCount).toBe(5);
    expect(release.featCount).toBe(1);
    expect(release.fixCount).toBe(1);
    expect(release.refactorCount).toBe(1);
    expect(release.testCount).toBe(1);
    expect(release.otherCount).toBe(1);
    expect(release.durationDays).toBeCloseTo(1.43, 1);
    expect(release.linesAdded).toBe(500);
    expect(release.linesDeleted).toBe(200);
  });

  it('prevReleasedAt が null の場合 durationDays は 0', () => {
    const data: ReleaseGitData = {
      tag: 'v0.1.0',
      prevTag: null,
      releasedAt: '2026-01-01T00:00:00.000Z',
      prevReleasedAt: null,
      repoName: null,
      packageTags: [],
      commitSubjects: ['feat: initial release'],
      filesChanged: 100,
      linesAdded: 5000,
      linesDeleted: 0,
      affectedPackages: ['trail-core'],
    };

    const release = buildReleaseFromGitData(data);
    expect(release.durationDays).toBe(0);
    expect(release.prevTag).toBeNull();
  });
});
