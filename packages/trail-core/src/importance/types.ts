export interface FunctionInfo {
  /** "file::path/to/file.ts::functionName" 形式 */
  readonly id: string;
  readonly name: string;
  readonly filePath: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly language: string;
}

export interface FunctionMetrics {
  /** 他の関数からの呼び出し回数（EdgeExtractor の call エッジで計算） */
  readonly fanIn: number;
  /** 分岐・ループのネスト深さ（認知的複雑度） */
  readonly cognitiveComplexity: number;
  /** McCabe サイクロマティック複雑度（制御フローグラフの独立パス数） */
  readonly cyclomaticComplexity: number;
  /** データ変更の度合い（代入・ミューテーションメソッド等の重み付き合計） */
  readonly dataMutationScore: number;
  /** 副作用の度合い（I/O・グローバル変数アクセス等の重み付き合計） */
  readonly sideEffectScore: number;
  /** 関数の行数 */
  readonly lineCount: number;
  /** 関数 body 内の CallExpression / JSX タグの呼び出し総数 */
  readonly fanOut: number;
  /** 関数 body 内で呼ばれる関数の distinct 数 */
  readonly distinctCallees: number;
}

export interface ScoredFunction extends FunctionInfo {
  readonly metrics: FunctionMetrics;
  /** 0〜100 の複合スコア */
  readonly importanceScore: number;
}

/** C4 オーバーレイ用（ComplexityMatrix と同形式） */
export type ImportanceMatrix = Record<string, number>;

export interface ImportanceReport {
  readonly generatedAt: string;
  readonly topFunctions: ScoredFunction[];
  readonly thresholds: {
    readonly high: number;
    readonly medium: number;
  };
}

export interface ImportanceScorerWeights {
  readonly fanIn: number;
  readonly cognitiveComplexity: number;
  readonly dataMutationScore: number;
  readonly sideEffectScore: number;
  readonly lineCount: number;
}
