import type { CoverageMatrix, CoverageDiffMatrix, CoverageDiffEntry, CoverageDelta } from '../types';

function delta(basePct: number, currentPct: number): CoverageDelta {
  return { pctDelta: Math.round((currentPct - basePct) * 100) / 100 };
}

export function computeCoverageDiff(
  base: CoverageMatrix,
  current: CoverageMatrix,
): CoverageDiffMatrix {
  const baseMap = new Map(base.entries.map(e => [e.elementId, e]));
  const currentMap = new Map(current.entries.map(e => [e.elementId, e]));

  const allIds = new Set([...baseMap.keys(), ...currentMap.keys()]);
  const entries: CoverageDiffEntry[] = [];

  for (const id of allIds) {
    const b = baseMap.get(id);
    const c = currentMap.get(id);

    if (c && b) {
      entries.push({
        elementId: id,
        lines: delta(b.lines.pct, c.lines.pct),
        branches: delta(b.branches.pct, c.branches.pct),
        functions: delta(b.functions.pct, c.functions.pct),
      });
    } else if (c) {
      entries.push({
        elementId: id,
        lines: delta(0, c.lines.pct),
        branches: delta(0, c.branches.pct),
        functions: delta(0, c.functions.pct),
      });
    } else if (b) {
      entries.push({
        elementId: id,
        lines: delta(b.lines.pct, 0),
        branches: delta(b.branches.pct, 0),
        functions: delta(b.functions.pct, 0),
      });
    }
  }

  return {
    entries,
    baseGeneratedAt: base.generatedAt,
    currentGeneratedAt: current.generatedAt,
  };
}
