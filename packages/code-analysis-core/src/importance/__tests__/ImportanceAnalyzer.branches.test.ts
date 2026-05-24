/**
 * Branch coverage tests for ImportanceAnalyzer:
 * - adapter without optional computeFanInMap/computeFanOutMap methods (lines 25-28)
 * - fanOutMap.get returns undefined → uses default (line 33)
 * - toReport with custom thresholds
 */
import { ImportanceAnalyzer } from '../ImportanceAnalyzer';
import type { ILanguageAdapter } from '../adapters/ILanguageAdapter';
import type { FunctionInfo, FunctionMetrics } from '../types';

const MOCK_FN: FunctionInfo = {
  id: 'file::a.ts::foo',
  name: 'foo',
  filePath: 'a.ts',
  startLine: 1,
  endLine: 5,
  language: 'typescript',
};

const MOCK_METRICS: Omit<FunctionMetrics, 'fanIn' | 'fanOut' | 'distinctCallees'> = {
  cognitiveComplexity: 2,
  cyclomaticComplexity: 2,
  dataMutationScore: 1,
  sideEffectScore: 0,
  lineCount: 5,
};

/**
 * Minimal adapter WITHOUT optional computeFanInMap and computeFanOutMap.
 * This covers the `?? new Map()` branches in ImportanceAnalyzer.analyze.
 */
class MinimalAdapter implements ILanguageAdapter {
  readonly language = 'typescript';
  extractFunctions(_filePaths: string[]): FunctionInfo[] {
    return [MOCK_FN];
  }
  computeMetrics(_fn: FunctionInfo): Omit<FunctionMetrics, 'fanIn' | 'fanOut' | 'distinctCallees'> {
    return MOCK_METRICS;
  }
  // NOTE: computeFanInMap and computeFanOutMap intentionally omitted
}

/**
 * Adapter WITH computeFanInMap and computeFanOutMap but returning empty maps,
 * so fanOutMap.get(fn.id) returns undefined → hits the ?? fallback on line 33.
 */
class AdapterWithEmptyMaps implements ILanguageAdapter {
  readonly language = 'typescript';
  extractFunctions(_filePaths: string[]): FunctionInfo[] {
    return [MOCK_FN];
  }
  computeMetrics(_fn: FunctionInfo): Omit<FunctionMetrics, 'fanIn' | 'fanOut' | 'distinctCallees'> {
    return MOCK_METRICS;
  }
  computeFanInMap(): Map<string, number> {
    return new Map(); // fn.id not present → fanIn falls back to 0
  }
  computeFanOutMap(): Map<string, { fanOut: number; distinctCallees: number }> {
    return new Map(); // fn.id not present → uses default { fanOut: 0, distinctCallees: 0 }
  }
}

describe('ImportanceAnalyzer branch coverage', () => {
  test('adapter without optional methods: fanIn and fanOut default to 0', () => {
    const analyzer = new ImportanceAnalyzer(new MinimalAdapter());
    const results = analyzer.analyze(['a.ts']);
    expect(results).toHaveLength(1);
    expect(results[0].metrics.fanIn).toBe(0);
    expect(results[0].metrics.fanOut).toBe(0);
    expect(results[0].metrics.distinctCallees).toBe(0);
  });

  test('adapter with empty maps: fanOutMap.get miss falls back to default', () => {
    const analyzer = new ImportanceAnalyzer(new AdapterWithEmptyMaps());
    const results = analyzer.analyze(['a.ts']);
    expect(results).toHaveLength(1);
    expect(results[0].metrics.fanIn).toBe(0);
    expect(results[0].metrics.fanOut).toBe(0);
  });

  test('toReport with custom thresholds uses provided values', () => {
    const scored = [
      { ...MOCK_FN, metrics: { ...MOCK_METRICS, fanIn: 0, fanOut: 0, distinctCallees: 0 }, importanceScore: 80 },
      { ...MOCK_FN, id: 'f2', name: 'bar', metrics: { ...MOCK_METRICS, fanIn: 0, fanOut: 0, distinctCallees: 0 }, importanceScore: 30 },
    ];
    const report = ImportanceAnalyzer.toReport(scored, { high: 75, medium: 25 });
    expect(report.thresholds.high).toBe(75);
    expect(report.thresholds.medium).toBe(25);
    // sorted descending
    expect(report.topFunctions[0].importanceScore).toBe(80);
    expect(report.topFunctions[1].importanceScore).toBe(30);
  });

  test('toImportanceMatrix maps id to importanceScore', () => {
    const scored = [
      { ...MOCK_FN, metrics: { ...MOCK_METRICS, fanIn: 0, fanOut: 0, distinctCallees: 0 }, importanceScore: 55 },
    ];
    const matrix = ImportanceAnalyzer.toImportanceMatrix(scored);
    expect(matrix[MOCK_FN.id]).toBe(55);
  });
});
