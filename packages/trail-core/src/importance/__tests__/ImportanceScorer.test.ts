import { ImportanceScorer } from '../ImportanceScorer';
import type { FunctionMetrics } from '../types';

const makeMetrics = (overrides: Partial<FunctionMetrics> = {}): FunctionMetrics => ({
  fanIn: 0,
  cognitiveComplexity: 0,
  dataMutationScore: 0,
  sideEffectScore: 0,
  lineCount: 1,
  ...overrides,
});

describe('ImportanceScorer', () => {
  describe('normalize', () => {
    it('returns 0 when max is 0', () => {
      expect(ImportanceScorer.normalize(5, 0)).toBe(0);
    });

    it('returns 1 when value equals max', () => {
      expect(ImportanceScorer.normalize(10, 10)).toBe(1);
    });

    it('clamps to 1 when value exceeds max', () => {
      expect(ImportanceScorer.normalize(15, 10)).toBe(1);
    });

    it('returns ratio for normal values', () => {
      expect(ImportanceScorer.normalize(5, 10)).toBe(0.5);
    });
  });

  describe('computeScore', () => {
    it('returns 0 when all metrics are 0', () => {
      const metrics = makeMetrics({ lineCount: 0 });
      const maxValues = makeMetrics({ lineCount: 0 });
      expect(ImportanceScorer.computeScore(metrics, maxValues)).toBe(0);
    });

    it('returns 100 when all metrics equal max', () => {
      const metrics = makeMetrics({ fanIn: 10, cognitiveComplexity: 5, dataMutationScore: 8, sideEffectScore: 3, lineCount: 20 });
      const maxValues = { ...metrics };
      expect(ImportanceScorer.computeScore(metrics, maxValues)).toBe(100);
    });

    it('weighs fanIn at 30%', () => {
      // fanIn のみ最大値、他は0
      const metrics = makeMetrics({ fanIn: 10 });
      const maxValues = makeMetrics({ fanIn: 10, lineCount: 1 });
      // 0.30 * 1.0 + 0.10 * normalize(1,1) = 0.30 + 0.10 = 0.40 → 40
      // lineCount=1, maxLineCount=1 → 0.10 * 1 = 0.10 → 合計 0.40 → 40
      const score = ImportanceScorer.computeScore(metrics, maxValues);
      expect(score).toBe(40);
    });

    it('accepts custom weights', () => {
      const metrics = makeMetrics({ fanIn: 10 });
      const maxValues = makeMetrics({ fanIn: 10, lineCount: 1 });
      const weights = { fanIn: 1.0, cognitiveComplexity: 0, dataMutationScore: 0, sideEffectScore: 0, lineCount: 0 };
      expect(ImportanceScorer.computeScore(metrics, maxValues, weights)).toBe(100);
    });
  });

  describe('computeMaxValues', () => {
    it('returns max of each metric across functions', () => {
      const a = makeMetrics({ fanIn: 2, lineCount: 5 });
      const b = makeMetrics({ fanIn: 8, lineCount: 3 });
      const result = ImportanceScorer.computeMaxValues([a, b]);
      expect(result.fanIn).toBe(8);
      expect(result.lineCount).toBe(5);
    });

    it('returns zero metrics for empty array', () => {
      const result = ImportanceScorer.computeMaxValues([]);
      expect(result.fanIn).toBe(0);
    });
  });

  describe('scoreAll', () => {
    it('returns ScoredFunction array with importanceScore attached', () => {
      const infos = [
        { id: 'f1', name: 'foo', filePath: 'a.ts', startLine: 1, endLine: 5, language: 'typescript' },
        { id: 'f2', name: 'bar', filePath: 'a.ts', startLine: 6, endLine: 20, language: 'typescript' },
      ];
      const metricsMap = new Map([
        ['f1', makeMetrics({ fanIn: 5 })],
        ['f2', makeMetrics({ fanIn: 10, lineCount: 15 })],
      ]);
      const scorer = new ImportanceScorer();
      const results = scorer.scoreAll(infos, metricsMap);
      expect(results).toHaveLength(2);
      expect(results[0].importanceScore).toBeGreaterThanOrEqual(0);
      expect(results[0].importanceScore).toBeLessThanOrEqual(100);
      // f2 は fanIn が高いので f1 より高スコア
      const f1 = results.find(r => r.id === 'f1')!;
      const f2 = results.find(r => r.id === 'f2')!;
      expect(f2.importanceScore).toBeGreaterThan(f1.importanceScore);
    });
  });
});
