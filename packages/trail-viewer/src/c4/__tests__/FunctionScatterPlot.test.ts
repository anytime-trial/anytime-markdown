import { assignComplexityTier, buildBubbleSeries } from '../components/panels/FunctionScatterPlot';
import type { FunctionAnalysisApiEntry } from '../hooks/fetchFunctionAnalysisApi';

function entry(overrides: Partial<FunctionAnalysisApiEntry>): FunctionAnalysisApiEntry {
  return {
    filePath: 'src/foo.ts',
    functionName: 'foo',
    startLine: 1,
    endLine: 10,
    language: 'typescript',
    fanIn: 0,
    fanOut: 0,
    distinctCallees: 0,
    cognitiveComplexity: 0,
    dataMutationScore: 0,
    sideEffectScore: 0,
    lineCount: 10,
    importanceScore: 0,
    functionRole: 'leaf',
    signals: { fanInZero: true },
    ...overrides,
  };
}

describe('assignComplexityTier', () => {
  it('returns low for complexity 0', () => {
    expect(assignComplexityTier(0)).toBe('low');
  });
  it('returns low for complexity 4', () => {
    expect(assignComplexityTier(4)).toBe('low');
  });
  it('returns mid for complexity 5', () => {
    expect(assignComplexityTier(5)).toBe('mid');
  });
  it('returns mid for complexity 14', () => {
    expect(assignComplexityTier(14)).toBe('mid');
  });
  it('returns high for complexity 15', () => {
    expect(assignComplexityTier(15)).toBe('high');
  });
  it('returns high for complexity 100', () => {
    expect(assignComplexityTier(100)).toBe('high');
  });
});

describe('buildBubbleSeries', () => {
  it('returns empty array for empty input', () => {
    expect(buildBubbleSeries([])).toEqual([]);
  });

  it('creates one series for a single entry', () => {
    const result = buildBubbleSeries([entry({ functionRole: 'leaf', cognitiveComplexity: 3 })]);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('leaf-low');
    expect(result[0]?.markerSize).toBe(4);
  });

  it('creates separate series for different tiers of the same role', () => {
    const result = buildBubbleSeries([
      entry({ functionRole: 'hub', cognitiveComplexity: 2 }),
      entry({ functionRole: 'hub', cognitiveComplexity: 10 }),
      entry({ functionRole: 'hub', cognitiveComplexity: 20 }),
    ]);
    const ids = result.map((s) => s.id).sort();
    expect(ids).toEqual(['hub-high', 'hub-low', 'hub-mid']);
  });

  it('skips empty tier-role combinations', () => {
    const result = buildBubbleSeries([
      entry({ functionRole: 'leaf', cognitiveComplexity: 3 }),
    ]);
    // leaf-low のみ、leaf-mid と leaf-high は生成されない
    expect(result.every((s) => s.id === 'leaf-low')).toBe(true);
  });

  it('data points contain fanIn as x and fanOut as y', () => {
    const result = buildBubbleSeries([
      entry({ functionRole: 'leaf', cognitiveComplexity: 3, fanIn: 5, fanOut: 2 }),
    ]);
    expect(result[0]?.data[0]).toMatchObject({ x: 5, y: 2 });
  });

  it('respects role order: hub before orchestrator before leaf before peripheral', () => {
    const result = buildBubbleSeries([
      entry({ functionRole: 'peripheral', cognitiveComplexity: 1 }),
      entry({ functionRole: 'hub', cognitiveComplexity: 1 }),
    ]);
    expect(result[0]?.id.startsWith('hub')).toBe(true);
    expect(result[1]?.id.startsWith('peripheral')).toBe(true);
  });
});
