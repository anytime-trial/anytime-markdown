import type { ILanguageAdapter } from './adapters/ILanguageAdapter';
import type {
  FunctionMetrics,
  ImportanceMatrix,
  ImportanceReport,
  ScoredFunction,
} from './types';
import { ImportanceScorer } from './ImportanceScorer';

export class ImportanceAnalyzer {
  private readonly adapter: ILanguageAdapter;
  private readonly scorer: ImportanceScorer;

  constructor(adapter: ILanguageAdapter, scorer = new ImportanceScorer()) {
    this.adapter = adapter;
    this.scorer = scorer;
  }

  /**
   * 指定ファイル群を解析し、重要度スコア付きの関数一覧を返す。
   * fanIn は将来 EdgeExtractor との統合で更新予定（現在は 0 固定）。
   */
  analyze(filePaths: string[]): ScoredFunction[] {
    const functions = this.adapter.extractFunctions(filePaths);
    const fanInMap = this.adapter.computeFanInMap?.() ?? new Map<string, number>();

    const metricsMap = new Map<string, FunctionMetrics>();
    for (const fn of functions) {
      const partial = this.adapter.computeMetrics(fn);
      metricsMap.set(fn.id, { ...partial, fanIn: fanInMap.get(fn.id) ?? 0 });
    }

    return this.scorer.scoreAll(functions, metricsMap);
  }

  static toImportanceMatrix(scored: ScoredFunction[]): ImportanceMatrix {
    const matrix: ImportanceMatrix = {};
    for (const fn of scored) {
      matrix[fn.id] = fn.importanceScore;
    }
    return matrix;
  }

  static toReport(
    scored: ScoredFunction[],
    thresholds = { high: 70, medium: 40 },
  ): ImportanceReport {
    const sorted = [...scored].sort((a, b) => b.importanceScore - a.importanceScore);
    return {
      generatedAt: new Date().toISOString(),
      topFunctions: sorted,
      thresholds,
    };
  }
}
