export interface DeadCodeSignals {
  readonly orphan: boolean;
  readonly fanInZero: boolean;
  readonly noRecentChurn: boolean;
  readonly zeroCoverage: boolean;
  readonly isolatedCommunity: boolean;
}

export interface FileAnalysisRow {
  readonly repoName: string;
  readonly filePath: string;
  readonly importanceScore: number;
  readonly fanInTotal: number;
  readonly cognitiveComplexityMax: number;
  readonly cyclomaticComplexityMax: number;
  /** ファイル全体の行数。0 はデータなしとして扱う */
  readonly lineCount: number;
  readonly functionCount: number;
  readonly deadCodeScore: number;
  readonly signals: DeadCodeSignals;
  readonly isIgnored: boolean;
  readonly ignoreReason: string;
  readonly crossPkgInCount: number;
  readonly externalConsumerPkgs: number;
  readonly totalInCount: number;
  readonly isBarrel: boolean;
  readonly centralityScore: number;
  /**
   * UI / Logic 分類。C4 architecture overlay の集計に使う。
   * classifyFile() の戻り値と一致 ('ui' | 'logic' | 'excluded')。
   */
  readonly category: 'ui' | 'logic' | 'excluded';
  /** UTC ISO 8601 (e.g. 2026-05-05T01:23:45.000Z) */
  readonly analyzedAt: string;
}

export interface FunctionAnalysisRow {
  readonly repoName: string;
  readonly filePath: string;
  readonly functionName: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly language: string;
  readonly fanIn: number;
  readonly cognitiveComplexity: number;
  readonly cyclomaticComplexity: number;
  readonly dataMutationScore: number;
  readonly sideEffectScore: number;
  readonly lineCount: number;
  readonly importanceScore: number;
  readonly signalFanInZero: boolean;
  readonly fanOut: number;
  readonly distinctCallees: number;
  /** UTC ISO 8601 (e.g. 2026-05-05T01:23:45.000Z) */
  readonly analyzedAt: string;
}
