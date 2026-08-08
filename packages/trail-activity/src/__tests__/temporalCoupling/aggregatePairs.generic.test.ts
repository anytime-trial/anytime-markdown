import { aggregatePairs, pairKey } from '../../temporalCoupling/aggregatePairs';
import type {
  AggregatePairsOptions,
  CommitFileRow,
  GroupedFileRow,
} from '../../temporalCoupling/types';

const baseOptions: AggregatePairsOptions = {
  minChangeCount: 1,
  maxFilesPerGroup: 50,
};

describe('aggregatePairs (generic GroupedFileRow)', () => {
  it('returns empty when input is empty', () => {
    const { fileChangeCount, coChange } = aggregatePairs([], baseOptions);
    expect(fileChangeCount.size).toBe(0);
    expect(coChange.size).toBe(0);
  });

  it('aggregates pairs from a single group with two files', () => {
    const rows: GroupedFileRow[] = [
      { groupKey: 'g1', filePath: 'a.ts' },
      { groupKey: 'g1', filePath: 'b.ts' },
    ];
    const { fileChangeCount, coChange } = aggregatePairs(rows, baseOptions);
    expect(fileChangeCount.get('a.ts')).toBe(1);
    expect(fileChangeCount.get('b.ts')).toBe(1);
    expect(coChange.get(pairKey('a.ts', 'b.ts'))).toBe(1);
  });

  it('counts identical (groupKey,filePath) duplicates only once per group', () => {
    const rows: GroupedFileRow[] = [
      { groupKey: 'g1', filePath: 'a.ts' },
      { groupKey: 'g1', filePath: 'a.ts' },
      { groupKey: 'g1', filePath: 'b.ts' },
    ];
    const { fileChangeCount, coChange } = aggregatePairs(rows, baseOptions);
    expect(fileChangeCount.get('a.ts')).toBe(1);
    expect(fileChangeCount.get('b.ts')).toBe(1);
    expect(coChange.get(pairKey('a.ts', 'b.ts'))).toBe(1);
  });

  it('skips rows whose groupKey is empty string', () => {
    const rows: GroupedFileRow[] = [
      { groupKey: '', filePath: 'a.ts' },
      { groupKey: '', filePath: 'b.ts' },
      { groupKey: 'g1', filePath: 'c.ts' },
      { groupKey: 'g1', filePath: 'd.ts' },
    ];
    const { fileChangeCount, coChange } = aggregatePairs(rows, baseOptions);
    expect(fileChangeCount.has('a.ts')).toBe(false);
    expect(fileChangeCount.has('b.ts')).toBe(false);
    expect(fileChangeCount.get('c.ts')).toBe(1);
    expect(fileChangeCount.get('d.ts')).toBe(1);
    expect(coChange.has(pairKey('a.ts', 'b.ts'))).toBe(false);
    expect(coChange.get(pairKey('c.ts', 'd.ts'))).toBe(1);
  });

  it('reproduces Phase 1 commit-grain results when commitHash is mapped to groupKey', () => {
    // 既存の commit 粒度結果と一致することを保証 (後方互換性)
    const commitRows: CommitFileRow[] = [
      { commitHash: 'c1', filePath: 'a.ts' },
      { commitHash: 'c1', filePath: 'b.ts' },
      { commitHash: 'c2', filePath: 'a.ts' },
      { commitHash: 'c2', filePath: 'b.ts' },
      { commitHash: 'c3', filePath: 'a.ts' },
    ];
    const grouped: GroupedFileRow[] = commitRows.map((r) => ({
      groupKey: r.commitHash,
      filePath: r.filePath,
    }));
    const { fileChangeCount, coChange } = aggregatePairs(grouped, baseOptions);
    expect(fileChangeCount.get('a.ts')).toBe(3);
    expect(fileChangeCount.get('b.ts')).toBe(2);
    expect(coChange.get(pairKey('a.ts', 'b.ts'))).toBe(2);
  });

  it('honors maxFilesPerGroup as primary cap', () => {
    const rows: GroupedFileRow[] = [
      { groupKey: 'g1', filePath: 'a.ts' },
      { groupKey: 'g1', filePath: 'b.ts' },
      { groupKey: 'g1', filePath: 'c.ts' },
      { groupKey: 'g2', filePath: 'a.ts' },
      { groupKey: 'g2', filePath: 'b.ts' },
    ];
    const { fileChangeCount } = aggregatePairs(rows, {
      minChangeCount: 1,
      maxFilesPerGroup: 2, // g1 は 3 ファイルなのでスキップ
    });
    expect(fileChangeCount.get('a.ts')).toBe(1); // g2 のみ
    expect(fileChangeCount.get('b.ts')).toBe(1);
    expect(fileChangeCount.has('c.ts')).toBe(false);
  });

  it('falls back to maxFilesPerCommit alias when maxFilesPerGroup is omitted', () => {
    const rows: GroupedFileRow[] = [
      { groupKey: 'g1', filePath: 'a.ts' },
      { groupKey: 'g1', filePath: 'b.ts' },
      { groupKey: 'g1', filePath: 'c.ts' },
      { groupKey: 'g2', filePath: 'a.ts' },
      { groupKey: 'g2', filePath: 'b.ts' },
    ];
    const optionsWithLegacyName = {
      minChangeCount: 1,
      maxFilesPerCommit: 2,
    } as AggregatePairsOptions;
    const { fileChangeCount } = aggregatePairs(rows, optionsWithLegacyName);
    expect(fileChangeCount.get('a.ts')).toBe(1);
    expect(fileChangeCount.has('c.ts')).toBe(false);
  });
});
