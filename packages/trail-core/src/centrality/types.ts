export interface FileCentrality {
  readonly filePath: string;
  readonly crossPkgIn: number;
  readonly externalConsumerPkgs: number;
  readonly totalIn: number;
  readonly isBarrel: boolean;
  readonly centralityScore: number;
}

export type CentralityMatrix = Record<string, number>;

export interface FileMeta {
  readonly functionCount: number;
  readonly cognitiveComplexityMax: number;
}

export interface CentralityWeights {
  readonly alpha: number;
  readonly beta: number;
  readonly gamma: number;
  readonly barrelPenalty: number;
}

export const DEFAULT_CENTRALITY_WEIGHTS: CentralityWeights = {
  alpha: 0.5,
  beta: 0.3,
  gamma: 0.2,
  barrelPenalty: 0.5,
};
