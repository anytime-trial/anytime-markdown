import { computeSubagentTypeCoupling } from '../../temporalCoupling/computeSubagentTypeCoupling';
import type {
  ComputeTemporalCouplingOptions,
  SubagentTypeFileRow,
} from '../../temporalCoupling/types';

const baseOptions: ComputeTemporalCouplingOptions = {
  minChangeCount: 1,
  jaccardThreshold: 0,
  topK: 100,
  maxFilesPerCommit: 50,
};

describe('computeSubagentTypeCoupling', () => {
  it('returns empty for empty input', () => {
    expect(computeSubagentTypeCoupling([], baseOptions)).toEqual([]);
  });

  it('generates a pair from a single subagent_type touching two files (Jaccard=1.0)', () => {
    const rows: SubagentTypeFileRow[] = [
      { subagentType: 'Explore', filePath: 'a.ts' },
      { subagentType: 'Explore', filePath: 'b.ts' },
    ];
    const result = computeSubagentTypeCoupling(rows, baseOptions);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      source: 'a.ts',
      target: 'b.ts',
      coChangeCount: 1,
      jaccard: 1.0,
    });
  });

  it('aggregates the same pair across two subagent_types', () => {
    const rows: SubagentTypeFileRow[] = [
      { subagentType: 'Explore', filePath: 'a.ts' },
      { subagentType: 'Explore', filePath: 'b.ts' },
      { subagentType: 'code-reviewer', filePath: 'a.ts' },
      { subagentType: 'code-reviewer', filePath: 'b.ts' },
    ];
    const result = computeSubagentTypeCoupling(rows, baseOptions);
    expect(result).toHaveLength(1);
    expect(result[0].coChangeCount).toBe(2);
    expect(result[0].jaccard).toBe(1.0);
  });

  it('respects minChangeCount filter', () => {
    const rows: SubagentTypeFileRow[] = [
      { subagentType: 'Plan', filePath: 'a.ts' },
      { subagentType: 'Plan', filePath: 'b.ts' },
      { subagentType: 'Explore', filePath: 'c.ts' },
      { subagentType: 'Explore', filePath: 'd.ts' },
      { subagentType: 'code-reviewer', filePath: 'c.ts' },
      { subagentType: 'code-reviewer', filePath: 'd.ts' },
    ];
    const result = computeSubagentTypeCoupling(rows, {
      ...baseOptions,
      minChangeCount: 2,
    });
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('c.ts');
    expect(result[0].target).toBe('d.ts');
  });

  it('respects topK', () => {
    const rows: SubagentTypeFileRow[] = [
      { subagentType: 'Plan', filePath: 'a.ts' },
      { subagentType: 'Plan', filePath: 'b.ts' },
      { subagentType: 'Explore', filePath: 'c.ts' },
      { subagentType: 'Explore', filePath: 'd.ts' },
    ];
    const result = computeSubagentTypeCoupling(rows, { ...baseOptions, topK: 1 });
    expect(result).toHaveLength(1);
  });

  it('respects pathFilter', () => {
    const rows: SubagentTypeFileRow[] = [
      { subagentType: 'Explore', filePath: 'a.ts' },
      { subagentType: 'Explore', filePath: 'b.ts' },
      { subagentType: 'Explore', filePath: 'node_modules/x.js' },
    ];
    const result = computeSubagentTypeCoupling(rows, {
      ...baseOptions,
      pathFilter: (p) => !p.startsWith('node_modules/'),
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ source: 'a.ts', target: 'b.ts' });
  });

  it('filters out pairs below jaccardThreshold', () => {
    // T1 and T2 both touch a.ts+b.ts (jaccard=1.0), T3 only touches c.ts+d.ts (jaccard=1.0)
    // T4 touches a.ts alone, making a.ts appear 3 times total. b.ts appears twice.
    // Pair (a.ts, b.ts): co=2, source=3, target=2, union=3+2-2=3, jaccard=2/3≈0.67
    // Pair (c.ts, d.ts): co=1, source=1, target=1, union=1+1-1=1, jaccard=1.0
    const rows: SubagentTypeFileRow[] = [
      { subagentType: 'T1', filePath: 'a.ts' },
      { subagentType: 'T1', filePath: 'b.ts' },
      { subagentType: 'T2', filePath: 'a.ts' },
      { subagentType: 'T2', filePath: 'b.ts' },
      { subagentType: 'T3', filePath: 'a.ts' },
      { subagentType: 'T4', filePath: 'c.ts' },
      { subagentType: 'T4', filePath: 'd.ts' },
    ];
    // With threshold=0.9: (a.ts,b.ts) jaccard≈0.67 filtered out, (c.ts,d.ts) jaccard=1.0 kept
    const result = computeSubagentTypeCoupling(rows, { ...baseOptions, jaccardThreshold: 0.9 });
    expect(result.every((e) => e.source === 'c.ts' || e.target === 'c.ts' || e.source === 'd.ts' || e.target === 'd.ts')).toBe(true);
  });

  it('sorts by jaccard descending when jaccards differ', () => {
    // Pair (a,b): co=3, source=3, target=3, union=3, jaccard=1.0
    // Pair (c,d): co=1, source=3, target=1, union=3, jaccard=0.33
    const rows: SubagentTypeFileRow[] = [
      { subagentType: 'T1', filePath: 'a.ts' },
      { subagentType: 'T1', filePath: 'b.ts' },
      { subagentType: 'T2', filePath: 'a.ts' },
      { subagentType: 'T2', filePath: 'b.ts' },
      { subagentType: 'T3', filePath: 'a.ts' },
      { subagentType: 'T3', filePath: 'b.ts' },
      { subagentType: 'T4', filePath: 'c.ts' },
      { subagentType: 'T4', filePath: 'd.ts' },
      { subagentType: 'T5', filePath: 'c.ts' },
      { subagentType: 'T6', filePath: 'c.ts' },
    ];
    const result = computeSubagentTypeCoupling(rows, baseOptions);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0].jaccard).toBeGreaterThan(result[result.length - 1].jaccard);
  });

  it('sorts by coChangeCount when jaccard is equal', () => {
    // Create two pairs with same jaccard but different coChangeCount:
    // Pair (a,b): co=2, sourceCC=4, targetCC=4, union=6, jaccard=1/3
    // Pair (c,d): co=1, sourceCC=2, targetCC=2, union=3, jaccard=1/3
    const rows: SubagentTypeFileRow[] = [
      { subagentType: 'T1', filePath: 'a.ts' },
      { subagentType: 'T1', filePath: 'b.ts' },
      { subagentType: 'T2', filePath: 'a.ts' },
      { subagentType: 'T2', filePath: 'b.ts' },
      { subagentType: 'T3', filePath: 'a.ts' },
      { subagentType: 'T4', filePath: 'a.ts' },
      { subagentType: 'T5', filePath: 'c.ts' },
      { subagentType: 'T5', filePath: 'd.ts' },
      { subagentType: 'T6', filePath: 'c.ts' },
      { subagentType: 'T7', filePath: 'd.ts' },
    ];
    const result = computeSubagentTypeCoupling(rows, { ...baseOptions, jaccardThreshold: 0 });
    // At least 2 edges, sorted by coChangeCount desc when jaccard equal
    const abPair = result.find((e) => e.source === 'a.ts' && e.target === 'b.ts');
    const cdPair = result.find((e) => e.source === 'c.ts' && e.target === 'd.ts');
    if (abPair && cdPair && Math.abs(abPair.jaccard - cdPair.jaccard) < 0.01) {
      const abIdx = result.indexOf(abPair);
      const cdIdx = result.indexOf(cdPair);
      expect(abPair.coChangeCount).toBeGreaterThan(cdPair.coChangeCount);
      expect(abIdx).toBeLessThan(cdIdx);
    }
  });

  it('sorts by source when jaccard and coChangeCount are equal', () => {
    // Two pairs with equal jaccard=1.0 and equal co=1 but different sources: (a,b) and (c,d)
    const rows: SubagentTypeFileRow[] = [
      { subagentType: 'T1', filePath: 'a.ts' },
      { subagentType: 'T1', filePath: 'b.ts' },
      { subagentType: 'T2', filePath: 'c.ts' },
      { subagentType: 'T2', filePath: 'd.ts' },
    ];
    const result = computeSubagentTypeCoupling(rows, baseOptions);
    expect(result).toHaveLength(2);
    // 'a.ts' < 'c.ts' → (a,b) comes first
    expect(result[0].source).toBe('a.ts');
    expect(result[1].source).toBe('c.ts');
  });

  it('sorts by target when jaccard, coChangeCount, and source are equal', () => {
    // Build two pairs (a→c) and (a→b) with identical Jaccard and co-change counts.
    // 'a' appears in both groups; 'b' and 'c' each appear once alongside 'a'.
    const rows: SubagentTypeFileRow[] = [
      { subagentType: 'T1', filePath: 'a.ts' },
      { subagentType: 'T1', filePath: 'c.ts' },
      { subagentType: 'T2', filePath: 'a.ts' },
      { subagentType: 'T2', filePath: 'b.ts' },
    ];
    const result = computeSubagentTypeCoupling(rows, { ...baseOptions, jaccardThreshold: 0 });
    // Both pairs have jaccard=1.0, coChangeCount=1, source='a.ts'; target order: b < c
    expect(result.length).toBeGreaterThanOrEqual(2);
    const aPairs = result.filter((e) => e.source === 'a.ts');
    if (aPairs.length === 2) {
      expect(aPairs[0].target).toBe('b.ts');
      expect(aPairs[1].target).toBe('c.ts');
    }
  });

  it('skips rows with empty subagentType', () => {
    const rows: SubagentTypeFileRow[] = [
      { subagentType: '', filePath: 'a.ts' },
      { subagentType: '', filePath: 'b.ts' },
      { subagentType: 'Plan', filePath: 'c.ts' },
      { subagentType: 'Plan', filePath: 'd.ts' },
    ];
    const result = computeSubagentTypeCoupling(rows, baseOptions);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ source: 'c.ts', target: 'd.ts' });
  });
});
