/**
 * 分析パネルの表示期間（日数入力）に関する純粋関数。
 *
 * 期間はボタン選択（7 / 30 / 90）から任意日数の入力へ変わったため、
 * 「入力値をどう丸めるか」「表示期間からどれだけデータを取得するか」を
 * UI から切り離してここに置く。
 */
import type { PeriodDays } from '../../components/analytics/types';

export const PERIOD_DAYS_MIN = 1;
export const PERIOD_DAYS_MAX = 365;
export const PERIOD_DAYS_DEFAULT = 30;

/**
 * 期間入力欄の値を有効範囲へ丸める。
 * 空入力・非数値（NaN / Infinity）は既定値へ落とす。
 */
export function clampPeriodDays(value: number): PeriodDays {
  if (!Number.isFinite(value)) return PERIOD_DAYS_DEFAULT;
  const rounded = Math.round(value);
  if (rounded < PERIOD_DAYS_MIN) return PERIOD_DAYS_MIN;
  if (rounded > PERIOD_DAYS_MAX) return PERIOD_DAYS_MAX;
  return rounded;
}

/** combined データの最小取得日数。累積コミットの baseline 確保に必要な下限。 */
const COMBINED_MIN_RANGE_DAYS = 30;

/**
 * 表示期間から combined データの取得日数を決める。
 *
 * 累積コミットは「表示窓より前のコミット」を baseline として加算するため
 * （`components/analytics/charts/combined/axisInfo.ts` の commitRowsPreWindow）、
 * 表示期間が 30 日未満でも 30 日分を取得する。
 */
export function resolveCombinedRangeDays(periodDays: PeriodDays): number {
  return Math.max(periodDays, COMBINED_MIN_RANGE_DAYS);
}
