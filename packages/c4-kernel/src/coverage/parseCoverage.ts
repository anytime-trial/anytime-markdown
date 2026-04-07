import type { CoverageMetric } from '../types';

export interface FileCoverage {
  readonly filePath: string;
  readonly lines: CoverageMetric;
  readonly branches: CoverageMetric;
  readonly functions: CoverageMetric;
}

function calcPct(covered: number, total: number): number {
  if (total === 0) return 100;
  return Math.round((covered / total) * 10000) / 100;
}

function countStatements(s: Record<string, number>): CoverageMetric {
  const entries = Object.values(s);
  const total = entries.length;
  const covered = entries.filter(v => v > 0).length;
  return { covered, total, pct: calcPct(covered, total) };
}

function countFunctions(f: Record<string, number>): CoverageMetric {
  const entries = Object.values(f);
  const total = entries.length;
  const covered = entries.filter(v => v > 0).length;
  return { covered, total, pct: calcPct(covered, total) };
}

function countBranches(b: Record<string, number[]>): CoverageMetric {
  const arms = Object.values(b).flat();
  const total = arms.length;
  const covered = arms.filter(v => v > 0).length;
  return { covered, total, pct: calcPct(covered, total) };
}

interface RawCoverageEntry {
  readonly path: string;
  readonly s: Record<string, number>;
  readonly f: Record<string, number>;
  readonly b: Record<string, number[]>;
  readonly statementMap: unknown;
  readonly fnMap: unknown;
  readonly branchMap: unknown;
}

export function parseCoverage(
  raw: Record<string, RawCoverageEntry>,
): readonly FileCoverage[] {
  return Object.values(raw).map(entry => ({
    filePath: entry.path,
    lines: countStatements(entry.s),
    branches: countBranches(entry.b),
    functions: countFunctions(entry.f),
  }));
}
