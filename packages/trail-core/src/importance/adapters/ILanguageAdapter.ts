import type { FunctionInfo, FunctionMetrics } from '../types';

/**
 * 言語ごとにこのインターフェースを実装することで
 * ImportanceScorer を多言語対応させる。
 * fanIn のみ言語非依存の EdgeExtractor で共通計算するため除外する。
 */
export interface ILanguageAdapter {
  readonly language: string;

  /** 対象ファイル群から関数情報を抽出する */
  extractFunctions(filePaths: string[]): FunctionInfo[];

  /** fanIn を除くメトリクスを計算する */
  computeMetrics(fn: FunctionInfo): Omit<FunctionMetrics, 'fanIn'>;

  /**
   * プログラム全体の CallExpression を走査し、関数ID → 呼び出し回数 のマップを返す。
   * 実装できない場合は省略可（省略時は fanIn=0 として扱われる）。
   */
  computeFanInMap?(): Map<string, number>;
}
