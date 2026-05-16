import type { FunctionAnalysisApiEntry } from '../hooks/fetchFunctionAnalysisApi';

/** Default number of tour stops. */
export const DEFAULT_TOUR_SIZE = 10;

export interface TourStep {
  readonly entry: FunctionAnalysisApiEntry;
  /** 1-based ordinal for display ("3 / 10"). */
  readonly index: number;
  readonly total: number;
  /** Auto-generated human description. */
  readonly description: string;
}

/**
 * Auto-generate a short English description that highlights why a function is
 * interesting. Picks the most striking 2–3 traits among role, fan-in/out,
 * complexity, and size.
 */
export function describeEntry(entry: FunctionAnalysisApiEntry): string {
  const parts: string[] = [];
  parts.push(`Role: ${entry.functionRole}.`);
  if (entry.functionRole === 'hub' && entry.fanIn > 0) {
    parts.push(`Used from ${entry.fanIn} places.`);
  } else if (entry.fanIn > 10) {
    parts.push(`Heavily used (fanIn=${entry.fanIn}).`);
  }
  if (entry.fanOut > 5) {
    parts.push(`Calls ${entry.fanOut} other functions.`);
  }
  if (entry.cognitiveComplexity >= 15) {
    parts.push(`High complexity (CC=${entry.cognitiveComplexity}).`);
  } else if (entry.cognitiveComplexity >= 5) {
    parts.push(`Moderate complexity (CC=${entry.cognitiveComplexity}).`);
  }
  if (entry.lineCount >= 100) {
    parts.push(`Large function (${entry.lineCount} lines).`);
  }
  return parts.join(' ');
}

/**
 * Pick the top-N most important functions for the tour. Sort key:
 *   primary  = importanceScore desc
 *   tie 1    = role priority (hub > orchestrator > leaf > peripheral)
 *   tie 2    = fanIn desc
 * Duplicates by (filePath, functionName) are removed.
 */
export function selectTourTargets(
  entries: readonly FunctionAnalysisApiEntry[],
  size: number = DEFAULT_TOUR_SIZE,
): TourStep[] {
  const rolePriority: Record<string, number> = {
    hub: 3,
    orchestrator: 2,
    leaf: 1,
    peripheral: 0,
  };
  const sorted = [...entries].sort((a, b) => {
    if (a.importanceScore !== b.importanceScore) {
      return b.importanceScore - a.importanceScore;
    }
    const ra = rolePriority[a.functionRole] ?? 0;
    const rb = rolePriority[b.functionRole] ?? 0;
    if (ra !== rb) return rb - ra;
    return b.fanIn - a.fanIn;
  });
  const seen = new Set<string>();
  const picked: FunctionAnalysisApiEntry[] = [];
  for (const e of sorted) {
    const key = `${e.filePath}::${e.functionName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(e);
    if (picked.length >= size) break;
  }
  return picked.map((entry, i) => ({
    entry,
    index: i + 1,
    total: picked.length,
    description: describeEntry(entry),
  }));
}
