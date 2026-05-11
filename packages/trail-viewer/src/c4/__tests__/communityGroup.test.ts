import { communityIdOf, groupByCommunity } from '../canvas/communityGroup';
import type { FunctionAnalysisApiEntry } from '../hooks/fetchFunctionAnalysisApi';

function entry(
  filePath: string,
  functionName = 'fn',
  extras: Partial<FunctionAnalysisApiEntry> = {},
): FunctionAnalysisApiEntry {
  return {
    filePath,
    functionName,
    startLine: 1,
    endLine: 10,
    language: 'ts',
    fanIn: 0,
    fanOut: 0,
    distinctCallees: 0,
    cognitiveComplexity: 0,
    dataMutationScore: 0,
    sideEffectScore: 0,
    lineCount: 10,
    importanceScore: 0,
    functionRole: 'leaf',
    signals: { fanInZero: false },
    ...extras,
  };
}

describe('communityIdOf', () => {
  test('returns first 2 path segments', () => {
    expect(communityIdOf('packages/trail-viewer/src/c4/canvas/BubbleCanvas.tsx')).toBe(
      'packages/trail-viewer',
    );
  });

  test('handles paths with leading slash', () => {
    expect(communityIdOf('/packages/trail-viewer/src/foo.ts')).toBe('packages/trail-viewer');
  });

  test('returns _root for paths with fewer than 2 segments', () => {
    expect(communityIdOf('README.md')).toBe('_root');
    expect(communityIdOf('')).toBe('_root');
    expect(communityIdOf('/')).toBe('_root');
  });
});

describe('groupByCommunity', () => {
  test('groups entries by their community ID', () => {
    const entries = [
      entry('packages/trail-viewer/src/A.ts'),
      entry('packages/trail-viewer/src/B.ts'),
      entry('packages/memory-core/src/C.ts'),
    ];
    const groups = groupByCommunity(entries);
    expect(groups).toHaveLength(2);
    const tv = groups.find((g) => g.id === 'packages/trail-viewer');
    const mc = groups.find((g) => g.id === 'packages/memory-core');
    expect(tv?.entries).toHaveLength(2);
    expect(mc?.entries).toHaveLength(1);
  });

  test('sorts communities by entry count descending', () => {
    const entries = [
      entry('a/x/1.ts'),
      entry('b/y/1.ts'),
      entry('b/y/2.ts'),
      entry('b/y/3.ts'),
    ];
    const groups = groupByCommunity(entries);
    expect(groups[0]?.id).toBe('b/y');
    expect(groups[0]?.entries).toHaveLength(3);
    expect(groups[1]?.id).toBe('a/x');
    expect(groups[1]?.entries).toHaveLength(1);
  });

  test('returns empty array for no entries', () => {
    expect(groupByCommunity([])).toEqual([]);
  });

  test('puts root-level files in _root community', () => {
    const entries = [entry('README.md'), entry('package.json')];
    const groups = groupByCommunity(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.id).toBe('_root');
    expect(groups[0]?.entries).toHaveLength(2);
  });
});
