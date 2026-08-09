import type { C4Model, CoverageMatrix, CoverageEntry, CoverageMetric } from '../types';
import type { FileCoverage } from './parseCoverage';

function calcPct(covered: number, total: number): number {
  if (total === 0) return 100;
  return Math.round((covered / total) * 10000) / 100;
}

function mergeMetrics(a: CoverageMetric, b: CoverageMetric): CoverageMetric {
  const covered = a.covered + b.covered;
  const total = a.total + b.total;
  return { covered, total, pct: calcPct(covered, total) };
}

const EMPTY_METRIC: CoverageMetric = { covered: 0, total: 0, pct: 100 };

export function aggregateCoverage(
  files: readonly FileCoverage[],
  model: C4Model,
  projectRoot: string,
): CoverageMatrix {
  const codeElements = model.elements.filter(e => e.type === 'code');
  const relPathToId = new Map<string, string>();
  for (const el of codeElements) {
    if (el.id.startsWith('file::')) {
      relPathToId.set(el.id.slice(6), el.id);
    }
  }

  const entryMap = new Map<string, CoverageEntry>();
  for (const fc of files) {
    let relPath = fc.filePath.startsWith(projectRoot)
      ? fc.filePath.slice(projectRoot.length)
      : fc.filePath;
    if (relPath.startsWith('/') || relPath.startsWith('\\')) {
      relPath = relPath.slice(1);
    }
    const elementId = relPathToId.get(relPath);
    if (!elementId) continue;
    entryMap.set(elementId, {
      elementId,
      lines: fc.lines,
      branches: fc.branches,
      functions: fc.functions,
    });
  }

  const aggregated = new Map<string, CoverageEntry>();
  for (const [id, entry] of entryMap) {
    aggregated.set(id, entry);
  }

  const boundaryChildren = new Map<string, string[]>();
  for (const el of model.elements) {
    if (el.boundaryId) {
      const children = boundaryChildren.get(el.boundaryId) ?? [];
      children.push(el.id);
      boundaryChildren.set(el.boundaryId, children);
    }
  }

  function aggregate(elementId: string): CoverageEntry | null {
    if (aggregated.has(elementId)) return aggregated.get(elementId)!;
    const children = boundaryChildren.get(elementId);
    if (!children) return null;

    let lines = { ...EMPTY_METRIC };
    let branches = { ...EMPTY_METRIC };
    let functions = { ...EMPTY_METRIC };
    let hasData = false;

    for (const childId of children) {
      const childEntry = aggregate(childId);
      if (childEntry) {
        lines = mergeMetrics(lines, childEntry.lines);
        branches = mergeMetrics(branches, childEntry.branches);
        functions = mergeMetrics(functions, childEntry.functions);
        hasData = true;
      }
    }

    if (!hasData) return null;
    const entry: CoverageEntry = { elementId, lines, branches, functions };
    aggregated.set(elementId, entry);
    return entry;
  }

  for (const el of model.elements) {
    aggregate(el.id);
  }

  return {
    entries: [...aggregated.values()],
    generatedAt: Date.now(),
  };
}
