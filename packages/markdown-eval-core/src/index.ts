/**
 * @anytime-markdown/markdown-eval-core
 *
 * anytime-reverse-spec が生成した基本設計書 markdown を、
 * git HEAD ベースの golden と章単位でペア化し、3 軸 (Intent / Design /
 * Completeness) で採点する評価パイプラインの中核。
 *
 * LLM 推論はこのパッケージでは行わず、呼び出し側 (Claude セッション本体)
 * が excerpt を読んで採点する。
 */

export { evaluateReverseSpec } from './orchestrator';
export {
  cosineSimilarity,
  extractHeadings,
  extractIdentifiers,
  jaccardSimilarity,
  scoreHeuristic,
  tokenize,
} from './heuristic';
export { listDocuments, pairDocuments } from './document';
export type { MatchedPair, PairResult } from './document';
export { truncate } from './excerpt';
export type { TruncateResult } from './excerpt';
export type {
  DocumentPair,
  EvaluateReverseSpecInput,
  EvaluateReverseSpecOutput,
  GoldenFile,
  HeuristicScore,
} from './types';
