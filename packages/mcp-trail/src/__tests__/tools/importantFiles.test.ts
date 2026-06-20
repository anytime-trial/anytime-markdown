import { selectImportantFiles, type FileAnalysisEntry } from '../../tools/importantFiles';

const entry = (over: Partial<FileAnalysisEntry>): FileAnalysisEntry => ({
  filePath: 'a.ts',
  importanceScore: 0,
  centralityScore: 0,
  crossPkgInCount: 0,
  fanInTotal: 0,
  cognitiveComplexityMax: 0,
  deadCodeScore: 0,
  isBarrel: false,
  isIgnored: false,
  signals: '',
  category: 'code',
  ...over,
});

describe('selectImportantFiles', () => {
  test('default: importanceScore 降順で top-N、compact 列のみ', () => {
    const rows = [
      entry({ filePath: 'low.ts', importanceScore: 1 }),
      entry({ filePath: 'high.ts', importanceScore: 9, fanInTotal: 42, signals: 'hot' }),
      entry({ filePath: 'mid.ts', importanceScore: 5 }),
    ];
    const out = selectImportantFiles(rows, { limit: 2 });
    expect(out.map((r) => r.filePath)).toEqual(['high.ts', 'mid.ts']);
    expect(out[0]).toEqual({
      rank: 1,
      filePath: 'high.ts',
      importanceScore: 9,
      centralityScore: 0,
      signals: 'hot',
      reason: 'fanIn=42',
    });
  });

  test('isIgnored の行は除外する', () => {
    const rows = [
      entry({ filePath: 'keep.ts', importanceScore: 3 }),
      entry({ filePath: 'gen.ts', importanceScore: 99, isIgnored: true }),
    ];
    const out = selectImportantFiles(rows, { limit: 10 });
    expect(out.map((r) => r.filePath)).toEqual(['keep.ts']);
  });

  test("filter='dead' は deadCodeScore 降順", () => {
    const rows = [
      entry({ filePath: 'live.ts', importanceScore: 9, deadCodeScore: 0 }),
      entry({ filePath: 'dead.ts', importanceScore: 1, deadCodeScore: 8 }),
    ];
    const out = selectImportantFiles(rows, { limit: 1, filter: 'dead' });
    expect(out[0].filePath).toBe('dead.ts');
  });

  test("filter='barrel' は isBarrel のみ", () => {
    const rows = [
      entry({ filePath: 'index.ts', importanceScore: 1, isBarrel: true }),
      entry({ filePath: 'impl.ts', importanceScore: 9, isBarrel: false }),
    ];
    const out = selectImportantFiles(rows, { limit: 10, filter: 'barrel' });
    expect(out.map((r) => r.filePath)).toEqual(['index.ts']);
  });

  test("filter='central' は centralityScore 降順", () => {
    const rows = [
      entry({ filePath: 'low.ts', centralityScore: 1 }),
      entry({ filePath: 'high.ts', centralityScore: 9 }),
    ];
    const out = selectImportantFiles(rows, { limit: 1, filter: 'central' });
    expect(out[0].filePath).toBe('high.ts');
  });

  test("filter='risky' は cognitiveComplexityMax 降順", () => {
    const rows = [
      entry({ filePath: 'simple.ts', cognitiveComplexityMax: 1 }),
      entry({ filePath: 'complex.ts', cognitiveComplexityMax: 15 }),
    ];
    const out = selectImportantFiles(rows, { limit: 1, filter: 'risky' });
    expect(out[0].filePath).toBe('complex.ts');
  });
});
