import { computeDefectRisk } from '../computeDefectRisk';
import type { CommitRiskRow } from '../types';

const REF_DATE = '2026-01-31T00:00:00.000Z';

function row(
  filePath: string,
  commitMessage: string,
  daysAgo: number,
  commitHash = filePath + daysAgo,
): CommitRiskRow {
  const d = new Date(REF_DATE);
  d.setDate(d.getDate() - daysAgo);
  return { commitHash, filePath, commitMessage, committedAt: d.toISOString() };
}

describe('computeDefectRisk', () => {
  it('returns empty array for empty input', () => {
    expect(computeDefectRisk([], { halfLifeDays: 90, referenceDateIso: REF_DATE })).toEqual([]);
  });

  it('fix: commit increases score', () => {
    const rows = [
      row('src/a.ts', 'fix: bug', 1),
      row('src/b.ts', 'feat: feature', 1),
    ];
    const entries = computeDefectRisk(rows, { halfLifeDays: 90, referenceDateIso: REF_DATE });
    const a = entries.find((e) => e.filePath === 'src/a.ts')!;
    const b = entries.find((e) => e.filePath === 'src/b.ts')!;
    expect(a.fixCount).toBe(1);
    expect(b.fixCount).toBe(0);
    expect(a.score).toBeGreaterThan(b.score);
  });

  it('older commits decay lower than recent commits', () => {
    const rows = [
      row('src/old.ts', 'fix: old bug', 180),
      row('src/new.ts', 'fix: new bug', 1),
    ];
    const entries = computeDefectRisk(rows, { halfLifeDays: 90, referenceDateIso: REF_DATE });
    const old = entries.find((e) => e.filePath === 'src/old.ts')!;
    const newFile = entries.find((e) => e.filePath === 'src/new.ts')!;
    expect(newFile.score).toBeGreaterThan(old.score);
  });

  it('max score is normalized to 1.0', () => {
    const rows = [
      row('src/hot.ts', 'fix: bug', 1),
      row('src/hot.ts', 'fix: another bug', 2),
      row('src/cold.ts', 'feat: feature', 10),
    ];
    const entries = computeDefectRisk(rows, { halfLifeDays: 90, referenceDateIso: REF_DATE });
    const max = Math.max(...entries.map((e) => e.score));
    expect(max).toBeCloseTo(1.0);
  });

  it('results are sorted descending by score', () => {
    const rows = [
      row('src/cold.ts', 'feat: add', 100),
      row('src/hot.ts', 'fix: crash', 1),
    ];
    const entries = computeDefectRisk(rows, { halfLifeDays: 90, referenceDateIso: REF_DATE });
    expect(entries[0].filePath).toBe('src/hot.ts');
  });

  it('fix(scope): prefix is also treated as fix commit', () => {
    const rows = [row('src/a.ts', 'fix(api): null check', 1)];
    const entries = computeDefectRisk(rows, { halfLifeDays: 90, referenceDateIso: REF_DATE });
    expect(entries[0].fixCount).toBe(1);
  });
});
