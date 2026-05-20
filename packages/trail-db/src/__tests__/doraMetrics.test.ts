import { createTestTrailDatabase } from './support/createTestDb';
import type { TrailDatabase } from '../TrailDatabase';

const COMPUTED_AT = '2026-05-20T00:00:00.000Z';

describe('TrailDatabase DORA metrics (Step 4a)', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });
  afterEach(() => db.close());

  it('getDoraReleases / getDoraCommits return [] on an empty DB', () => {
    expect(db.getDoraReleases()).toEqual([]);
    expect(db.getDoraCommits()).toEqual([]);
  });

  it('replaceDoraMetrics accepts valid rows and is idempotent (wash-away)', () => {
    expect(() =>
      db.replaceDoraMetrics([
        {
          repoName: 'repoA',
          period: '2026-01',
          deploymentFrequency: 2,
          leadTimeHours: 36,
          computedAt: COMPUTED_AT,
        },
        {
          repoName: 'repoA',
          period: '2026-02',
          deploymentFrequency: 1,
          leadTimeHours: null,
          computedAt: COMPUTED_AT,
        },
      ]),
    ).not.toThrow();

    // 洗い替え: 空配列でも例外なく全削除できる
    expect(() => db.replaceDoraMetrics([])).not.toThrow();
    // 再投入も OK (PK 衝突しない = DELETE が効いている)
    expect(() =>
      db.replaceDoraMetrics([
        { repoName: 'repoA', period: '2026-01', deploymentFrequency: 5, leadTimeHours: 1, computedAt: COMPUTED_AT },
      ]),
    ).not.toThrow();
  });

  it('enforces the period GLOB CHECK constraint', () => {
    expect(() =>
      db.replaceDoraMetrics([
        { repoName: 'repoA', period: '2026-1', deploymentFrequency: 1, leadTimeHours: null, computedAt: COMPUTED_AT },
      ]),
    ).toThrow();
  });

  it('enforces the computed_at ISO 8601 CHECK constraint', () => {
    expect(() =>
      db.replaceDoraMetrics([
        { repoName: 'repoA', period: '2026-01', deploymentFrequency: 1, leadTimeHours: null, computedAt: '2026-05-20 00:00:00' },
      ]),
    ).toThrow();
  });
});
