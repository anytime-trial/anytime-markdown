/** Phase 6 S5-D: Newly Active Code Detection の入力（ファイル 1 件分） */
export type NewlyActiveInput = {
  filePath: string;
  /** 直近 W 日の churn（コミット数） */
  recentChurn: number;
  /** W 日より前の churn。全期間 churn - recentChurn で求める */
  priorChurn: number;
};

export type NewlyActiveEntry = NewlyActiveInput & {
  newlyActive: boolean;
};

export type ComputeNewlyActiveOptions = {
  /** newlyActive とみなす直近 churn の下限（既定 2。1 コミットの新規追加を拾いすぎないため） */
  minRecentChurn?: number;
  /** 「以前は動いていなかった」とみなす期間前 churn の上限（既定 0） */
  maxPriorChurn?: number;
  /**
   * リポジトリの取込履歴の長さ（日）。窓長に満たない場合は判定しない（全ファイルが
   * 「最近動き始めた」に見える誤検知を防ぐ）。省略時はガードを掛けない。
   */
  historyDays?: number;
  /** 直近窓の長さ（日・既定 30。historyDays との比較にのみ使う） */
  windowDays?: number;
};

const DEFAULT_MIN_RECENT_CHURN = 2;
const DEFAULT_MAX_PRIOR_CHURN = 0;
const DEFAULT_WINDOW_DAYS = 30;

/**
 * 「最近になって動き始めたコード」を検出する（Phase 6 S5-D）。
 *
 * ランタイムの呼び出し頻度を記録する仕組みが無く、コードグラフも単一スナップショットで
 * 過去の fanIn を持たないため、git churn の初出時期を代理指標にする。
 * 用途はドキュメント整備の優先度提示に限り、dead code スコアには加算しない
 * （新規活性は「死んでいない」ことの傍証であって欠陥リスクではない）。
 */
export function computeNewlyActive(
  inputs: readonly NewlyActiveInput[],
  options: ComputeNewlyActiveOptions = {},
): NewlyActiveEntry[] {
  const minRecentChurn = options.minRecentChurn ?? DEFAULT_MIN_RECENT_CHURN;
  const maxPriorChurn = options.maxPriorChurn ?? DEFAULT_MAX_PRIOR_CHURN;
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;

  // 取込履歴が窓長以下なら「期間前 churn = 0」が全ファイルで成立してしまうため判定しない
  const historyTooShort =
    options.historyDays !== undefined && options.historyDays <= windowDays;

  return inputs.map((input) => ({
    ...input,
    newlyActive:
      !historyTooShort &&
      input.recentChurn >= minRecentChurn &&
      input.priorChurn <= maxPriorChurn,
  }));
}
