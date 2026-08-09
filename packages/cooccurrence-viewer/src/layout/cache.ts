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
  // サーバ供給の座標はアルゴリズム版数を照合しない（graph-core の `layout.source` 参照）。
  // 照合するとビューア側のアルゴリズムを変えるたびに、供給された全体グラフの座標を捨てて
  // クライアントで計算し直すことになる。これは 100,000 ノード規模では成立しない。
  if (file.layout.source === 'server') return { decision: 'hit', specHash };
  if (file.layout.algorithmVersion !== BARNES_HUT_LAYOUT_ALGORITHM_VERSION) {
    return { decision: 'miss-algorithm', specHash };
  }
  return { decision: 'hit', specHash };
}
