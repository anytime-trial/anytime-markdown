import type { C4Model, CoverageMatrix, CoverageEntry, CoverageMetric } from '../types';
import type { ReleaseCoverageRow } from '../../domain/model/task';

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

function extractComponentDir(filePath: string, packageName: string): string | undefined {
  // filePath is an absolute path like: /home/.../packages/trail-activity/src/utils/foo.ts
  const pkgMarker = `/packages/${packageName}/`;
  const idx = filePath.indexOf(pkgMarker);
  const relPath = idx >= 0 ? filePath.slice(idx + pkgMarker.length) : filePath;

  // src/[dir]/... → dir
  const withSrc = /^src\/([^/]+)\//.exec(relPath);
  if (withSrc) return withSrc[1];

  // [dir]/... (no src prefix)
  const topDir = /^([^/]+)\//.exec(relPath);
  if (topDir && topDir[1] !== 'src') return topDir[1];

  return undefined;
}

export function aggregateCoverageFromDb(
  rows: readonly ReleaseCoverageRow[],
  model: C4Model,
): CoverageMatrix {
  const aggregated = new Map<string, CoverageEntry>();

  for (const row of rows) {
    if (row.file_path === '__total__') continue;

    const lines: CoverageMetric = { covered: row.lines_covered, total: row.lines_total, pct: row.lines_pct };
    const branches: CoverageMetric = { covered: row.branches_covered, total: row.branches_total, pct: row.branches_pct };
    const functions: CoverageMetric = { covered: row.functions_covered, total: row.functions_total, pct: row.functions_pct };

    // L4: file-level entry — elementId matches C4 code element IDs produced by toC4.ts
    const pkgMarker = `/packages/${row.package}/`;
    const pkgIdx = row.file_path.indexOf(pkgMarker);
    if (pkgIdx >= 0) {
      const fullRelPath = row.file_path.slice(pkgIdx + 1); // 'packages/pkg/src/dir/file.ts'
      aggregated.set(`file::${fullRelPath}`, { elementId: `file::${fullRelPath}`, lines, branches, functions });
    }

    // L3: component-level aggregation
    const componentDir = extractComponentDir(row.file_path, row.package);
    if (!componentDir) continue;

    const componentId = `pkg_${row.package}/${componentDir}`;
    const prev = aggregated.get(componentId);

    if (!prev) {
      aggregated.set(componentId, { elementId: componentId, lines, branches, functions });
    } else {
      aggregated.set(componentId, {
        elementId: componentId,
        lines: mergeMetrics(prev.lines, lines),
        branches: mergeMetrics(prev.branches, branches),
        functions: mergeMetrics(prev.functions, functions),
      });
    }
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
