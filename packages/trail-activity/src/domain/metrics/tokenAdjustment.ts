/**
 * トークン集計における「観測できなかったターン」を補正するためのヘルパー。
 *
 * 一部のターンでトークン使用量が記録されない場合（API 欠落等）、
 * 観測済みターンのトークン合計値に factor を掛けることで全体値を推計する。
 */

export interface TokenTurnCounts {
  readonly totalTurns: number;
  readonly missingTurns: number;
}

/**
 * 欠損ターンを補正するための乗数を返す。
 *
 * factor = totalTurns / (totalTurns - missingTurns)
 *
 * observed (= totalTurns - missingTurns) が 0 以下、または totalTurns が 0 の場合は
 * 補正不能として 1 を返す。
 */
export function tokenFactor(totalTurns: number, missingTurns: number): number {
  const observed = totalTurns - missingTurns;
  if (totalTurns <= 0 || observed <= 0) {
    return 1;
  }
  return totalTurns / observed;
}

/**
 * 欠損率（0〜1）を返す。
 *
 * totalTurns が 0 の場合は 0 を返す。
 */
export function tokenMissingRate(counts: TokenTurnCounts): number {
  const { totalTurns, missingTurns } = counts;
  if (totalTurns === 0) {
    return 0;
  }
  return missingTurns / totalTurns;
}

/**
 * 観測値に factor を掛けて補正後の値を返す。
 */
export function applyTokenFactor(value: number, factor: number): number {
  return value * factor;
}
