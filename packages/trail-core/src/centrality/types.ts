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

<<<<<<< HEAD
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
=======
export type FunctionRole = 'hub' | 'leaf' | 'orchestrator' | 'peripheral';

export interface ClassifiedFunction {
  readonly filePath: string;
  readonly functionName: string;
  readonly role: FunctionRole;
}

export interface ClassifiedFunctionInput {
  readonly filePath: string;
  readonly functionName: string;
  readonly fanIn: number;
  readonly fanOut: number;
}
>>>>>>> ae5286da (feat(trail-core): add function role classifier (4 quadrants by median fan_in/out))
