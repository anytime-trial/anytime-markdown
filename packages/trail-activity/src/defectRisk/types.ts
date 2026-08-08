export type CommitRiskRow = {
  commitHash: string;
  filePath: string;
  commitMessage: string;
  committedAt: string; // UTC ISO 8601
};

export type DefectRiskEntry = {
  filePath: string;
  fixCount: number;
  churnCount: number;
  score: number; // 0-1 正規化済み
};

export type ComputeDefectRiskOptions = {
  halfLifeDays: number;
  /** スコア計算の基準日（ISO UTC）。省略時は Date.now() */
  referenceDateIso?: string;
};
