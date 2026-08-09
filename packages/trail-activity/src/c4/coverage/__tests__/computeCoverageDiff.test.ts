import { computeCoverageDiff } from '../computeCoverageDiff';
import type { CoverageMatrix } from '../../types';

const base: CoverageMatrix = {
  entries: [
    {
      elementId: 'pkg_a',
      lines: { covered: 50, total: 100, pct: 50 },
      branches: { covered: 10, total: 20, pct: 50 },
      functions: { covered: 5, total: 10, pct: 50 },
    },
    {
      elementId: 'pkg_b',
      lines: { covered: 80, total: 100, pct: 80 },
      branches: { covered: 16, total: 20, pct: 80 },
      functions: { covered: 8, total: 10, pct: 80 },
    },
  ],
  generatedAt: 1000,
};

const current: CoverageMatrix = {
  entries: [
    {
      elementId: 'pkg_a',
      lines: { covered: 60, total: 100, pct: 60 },
      branches: { covered: 12, total: 20, pct: 60 },
      functions: { covered: 5, total: 10, pct: 50 },
    },
    {
      elementId: 'pkg_b',
      lines: { covered: 70, total: 100, pct: 70 },
      branches: { covered: 16, total: 20, pct: 80 },
      functions: { covered: 9, total: 10, pct: 90 },
    },
    {
      elementId: 'pkg_c',
      lines: { covered: 30, total: 50, pct: 60 },
      branches: { covered: 5, total: 10, pct: 50 },
      functions: { covered: 3, total: 5, pct: 60 },
    },
  ],
  generatedAt: 2000,
};

describe('computeCoverageDiff', () => {
  it('should compute pctDelta for matching elements', () => {
    const diff = computeCoverageDiff(base, current);
    const a = diff.entries.find(e => e.elementId === 'pkg_a')!;
    expect(a.lines.pctDelta).toBe(10);
    expect(a.branches.pctDelta).toBe(10);
    expect(a.functions.pctDelta).toBe(0);
  });

  it('should handle negative deltas', () => {
    const diff = computeCoverageDiff(base, current);
    const b = diff.entries.find(e => e.elementId === 'pkg_b')!;
    expect(b.lines.pctDelta).toBe(-10);
    expect(b.branches.pctDelta).toBe(0);
    expect(b.functions.pctDelta).toBe(10);
  });

  it('should include new elements with full pct as delta', () => {
    const diff = computeCoverageDiff(base, current);
    const c = diff.entries.find(e => e.elementId === 'pkg_c')!;
    expect(c.lines.pctDelta).toBe(60);
    expect(c.branches.pctDelta).toBe(50);
    expect(c.functions.pctDelta).toBe(60);
  });

  it('should include removed elements with negative pct as delta', () => {
    const diff = computeCoverageDiff(current, base);
    const c = diff.entries.find(e => e.elementId === 'pkg_c')!;
    expect(c.lines.pctDelta).toBe(-60);
  });

  it('should set timestamps', () => {
    const diff = computeCoverageDiff(base, current);
    expect(diff.baseGeneratedAt).toBe(1000);
    expect(diff.currentGeneratedAt).toBe(2000);
  });
});
