import { aggregateImportanceToFile } from '../aggregateImportanceToFile';
import type { ScoredFunction } from '../../importance/types';

const fn = (
  filePath: string,
  fanIn: number,
  cog: number,
  cyc: number,
  score: number,
): ScoredFunction => ({
  id: `file::${filePath}::f`,
  name: 'f',
  filePath,
  startLine: 1,
  endLine: 10,
  language: 'ts',
  metrics: {
    fanIn,
    cognitiveComplexity: cog,
    cyclomaticComplexity: cyc,
    dataMutationScore: 0,
    sideEffectScore: 0,
    lineCount: 10,
    fanOut: 0,
    distinctCallees: 0,
  },
  importanceScore: score,
});

describe('aggregateImportanceToFile', () => {
  it('同一ファイル内は max(score) / sum(fanIn) / max(cognitive) / count', () => {
    const result = aggregateImportanceToFile([
      fn('a.ts', 3, 5, 2, 50),
      fn('a.ts', 2, 8, 4, 70),
      fn('b.ts', 0, 1, 1, 10),
    ]);
    const a = result.get('a.ts');
    if (a === undefined) throw new Error('a.ts not found');
    expect(a.importanceScore).toBe(70);
    expect(a.fanInTotal).toBe(5);
    expect(a.cognitiveComplexityMax).toBe(8);
    expect(a.functionCount).toBe(2);
    const b = result.get('b.ts');
    if (b === undefined) throw new Error('b.ts not found');
    expect(b.functionCount).toBe(1);
  });

  it('空配列なら空 Map', () => {
    expect(aggregateImportanceToFile([]).size).toBe(0);
  });

  it('同一ファイル内の cyclomaticComplexityMax は最大値', () => {
    const result = aggregateImportanceToFile([
      fn('c.ts', 0, 0, 3, 10),
      fn('c.ts', 0, 0, 5, 20),
    ]);
    const c = result.get('c.ts');
    if (c === undefined) throw new Error('c.ts not found');
    expect(c.cyclomaticComplexityMax).toBe(5);
  });
});
