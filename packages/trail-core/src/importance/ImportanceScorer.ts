import type {
  FunctionInfo,
  FunctionMetrics,
  ImportanceScorerWeights,
  ScoredFunction,
} from './types';

export const DEFAULT_WEIGHTS: ImportanceScorerWeights = {
  fanIn:               0.30,
  cognitiveComplexity: 0.25,
  dataMutationScore:   0.25,
  sideEffectScore:     0.10,
  lineCount:           0.10,
};

const ZERO_METRICS: FunctionMetrics = {
  fanIn: 0,
  cognitiveComplexity: 0,
  dataMutationScore: 0,
  sideEffectScore: 0,
  lineCount: 0,
};

export class ImportanceScorer {
  private readonly weights: ImportanceScorerWeights;

  constructor(weights: ImportanceScorerWeights = DEFAULT_WEIGHTS) {
    this.weights = weights;
  }

  static normalize(value: number, max: number): number {
    return max === 0 ? 0 : Math.min(value / max, 1);
  }

  static computeScore(
    metrics: FunctionMetrics,
    maxValues: FunctionMetrics,
    weights: ImportanceScorerWeights = DEFAULT_WEIGHTS,
  ): number {
    const n = ImportanceScorer.normalize;
    const weighted =
      weights.fanIn               * n(metrics.fanIn, maxValues.fanIn) +
      weights.cognitiveComplexity * n(metrics.cognitiveComplexity, maxValues.cognitiveComplexity) +
      weights.dataMutationScore   * n(metrics.dataMutationScore, maxValues.dataMutationScore) +
      weights.sideEffectScore     * n(metrics.sideEffectScore, maxValues.sideEffectScore) +
      weights.lineCount           * n(metrics.lineCount, maxValues.lineCount);
    return Math.round(weighted * 100);
  }

  static computeMaxValues(metricsList: FunctionMetrics[]): FunctionMetrics {
    if (metricsList.length === 0) return { ...ZERO_METRICS };
    return {
      fanIn:               Math.max(...metricsList.map(m => m.fanIn)),
      cognitiveComplexity: Math.max(...metricsList.map(m => m.cognitiveComplexity)),
      dataMutationScore:   Math.max(...metricsList.map(m => m.dataMutationScore)),
      sideEffectScore:     Math.max(...metricsList.map(m => m.sideEffectScore)),
      lineCount:           Math.max(...metricsList.map(m => m.lineCount)),
    };
  }

  scoreAll(
    functions: readonly FunctionInfo[],
    metricsMap: ReadonlyMap<string, FunctionMetrics>,
  ): ScoredFunction[] {
    const allMetrics = functions
      .map(fn => metricsMap.get(fn.id))
      .filter((m): m is FunctionMetrics => m !== undefined);

    const maxValues = ImportanceScorer.computeMaxValues(allMetrics);

    return functions.map(fn => {
      const metrics = metricsMap.get(fn.id) ?? { ...ZERO_METRICS };
      return {
        ...fn,
        metrics,
        importanceScore: ImportanceScorer.computeScore(metrics, maxValues, this.weights),
      };
    });
  }
}
