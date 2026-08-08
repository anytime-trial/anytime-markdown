import type { ScoredFunction } from '../importance/types';

export interface FileImportanceAggregate {
  readonly importanceScore: number;
  readonly fanInTotal: number;
  readonly cognitiveComplexityMax: number;
  readonly cyclomaticComplexityMax: number;
  readonly functionCount: number;
}

export function aggregateImportanceToFile(
  fns: readonly ScoredFunction[],
): Map<string, FileImportanceAggregate> {
  const acc = new Map<string, { score: number; fanIn: number; cog: number; cyc: number; count: number }>();
  for (const fn of fns) {
    const e = acc.get(fn.filePath) ?? { score: 0, fanIn: 0, cog: 0, cyc: 0, count: 0 };
    e.score = Math.max(e.score, fn.importanceScore);
    e.fanIn += fn.metrics.fanIn;
    e.cog = Math.max(e.cog, fn.metrics.cognitiveComplexity);
    e.cyc = Math.max(e.cyc, fn.metrics.cyclomaticComplexity);
    e.count += 1;
    acc.set(fn.filePath, e);
  }
  const out = new Map<string, FileImportanceAggregate>();
  for (const [k, v] of acc) {
    out.set(k, {
      importanceScore: v.score,
      fanInTotal: v.fanIn,
      cognitiveComplexityMax: v.cog,
      cyclomaticComplexityMax: v.cyc,
      functionCount: v.count,
    });
  }
  return out;
}
