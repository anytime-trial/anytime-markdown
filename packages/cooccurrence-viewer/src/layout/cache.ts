import { BARNES_HUT_LAYOUT_ALGORITHM_VERSION, computeSpecHash, type CooccurrenceFile } from '@anytime-markdown/graph-core';
import type { CacheDecision } from '../types';

export interface CacheEvaluation {
  decision: CacheDecision;
  specHash: string;
}

export function evaluateLayoutCache(file: CooccurrenceFile): CacheEvaluation {
  const specHash = computeSpecHash(file.spec);
  if (!file.layout) return { decision: 'miss-absent', specHash };
  if (file.layout.specHash !== specHash) return { decision: 'miss-spec', specHash };
  if (file.layout.algorithmVersion !== BARNES_HUT_LAYOUT_ALGORITHM_VERSION) {
    return { decision: 'miss-algorithm', specHash };
  }
  return { decision: 'hit', specHash };
}
