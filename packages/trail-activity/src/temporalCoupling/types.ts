export type CommitFileRow = {
  commitHash: string;
  filePath: string;
};

export type SessionFileRow = {
  sessionId: string;
  filePath: string;
};

export type SubagentTypeFileRow = {
  subagentType: string;
  filePath: string;
};

export type GroupedFileRow = {
  groupKey: string;
  filePath: string;
};

export type TemporalCouplingEdge = {
  source: string;
  target: string;
  coChangeCount: number;
  sourceChangeCount: number;
  targetChangeCount: number;
  jaccard: number;
};

export type ComputeTemporalCouplingOptions = {
  minChangeCount: number;
  jaccardThreshold: number;
  topK: number;
  maxFilesPerCommit: number;
  excludePairs?: ReadonlyArray<readonly [string, string]>;
  pathFilter?: (filePath: string) => boolean;
};

export type CouplingDirection = 'A→B' | 'B→A' | 'undirected';

export type ConfidenceCouplingEdge = {
  source: string;
  target: string;
  direction: CouplingDirection;
  confidenceForward: number;
  confidenceBackward: number;
  coChangeCount: number;
  sourceChangeCount: number;
  targetChangeCount: number;
  jaccard: number;
};

export type ComputeConfidenceCouplingOptions = {
  minChangeCount: number;
  confidenceThreshold: number;
  directionalDiffThreshold: number;
  topK: number;
  maxFilesPerCommit: number;
  excludePairs?: ReadonlyArray<readonly [string, string]>;
  pathFilter?: (filePath: string) => boolean;
};

export type PairAggregation = {
  fileChangeCount: ReadonlyMap<string, number>;
  coChange: ReadonlyMap<string, number>;
};

export type AggregatePairsOptions = {
  minChangeCount: number;
  /** 1 グループあたりに含めるファイル数の上限（超過するとそのグループはスキップ）。 */
  maxFilesPerGroup?: number;
  /** 旧名。`maxFilesPerGroup` が未指定の場合のみ参照される後方互換 alias。 */
  maxFilesPerCommit?: number;
  excludePairs?: ReadonlyArray<readonly [string, string]>;
  pathFilter?: (filePath: string) => boolean;
};
