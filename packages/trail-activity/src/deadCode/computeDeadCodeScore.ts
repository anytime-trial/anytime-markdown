import type { DeadCodeSignals } from './types';

const WEIGHT_ORPHAN             = 45;
const WEIGHT_FAN_IN_ZERO        = 25;
const WEIGHT_NO_RECENT_CHURN    = 15;
const WEIGHT_ZERO_COVERAGE      = 10;
const WEIGHT_ISOLATED_COMMUNITY =  5;
// 合計 = 100

export function computeDeadCodeScore(signals: DeadCodeSignals, isIgnored: boolean): number {
  if (isIgnored) return 0;
  let score = 0;
  if (signals.orphan)            score += WEIGHT_ORPHAN;
  if (signals.fanInZero)         score += WEIGHT_FAN_IN_ZERO;
  if (signals.noRecentChurn)     score += WEIGHT_NO_RECENT_CHURN;
  if (signals.zeroCoverage)      score += WEIGHT_ZERO_COVERAGE;
  if (signals.isolatedCommunity) score += WEIGHT_ISOLATED_COMMUNITY;
  return score;
}
