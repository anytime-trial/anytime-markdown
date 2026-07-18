import { toLocalDateString } from '../hotspot/bucketing';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_TIMEZONE = 'Asia/Tokyo';

/** memory_drift_events の 1 行（履歴集計に必要な列のみ） */
export type DriftEventTimes = {
  detectedAt: string;
  /** 未解決は null */
  resolvedAt: string | null;
};

export type DriftHistoryPoint = {
  /** ローカル TZ の日付（YYYY-MM-DD） */
  date: string;
  detectedCount: number;
  resolvedCount: number;
  /** その日の終わり時点で未解決のドリフト件数（累計） */
  unresolvedCumulative: number;
};

export type AggregateDriftByDayOptions = {
  /** 集計範囲の開始・終了（UTC ISO 8601）。省略時はデータの最小・最大日 */
  sinceIso?: string;
  untilIso?: string;
  /** 日次境界に使うタイムゾーン（既定 Asia/Tokyo） */
  timeZone?: string;
};

function enumerateDates(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  // 日付文字列は TZ 変換済みのため、列挙は UTC 上で行って歪みを避ける
  let cur = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(cur) || Number.isNaN(end)) return out;
  while (cur <= end) {
    out.push(new Date(cur).toISOString().slice(0, 10));
    cur += MS_PER_DAY;
  }
  return out;
}

/**
 * ドリフト件数の日次推移を集計する（Phase 6 S5-C）。
 *
 * 日次境界はローカル TZ（既定 JST）。保存値は UTC のままで、境界だけを TZ 変換する。
 * データが 0 件の日も 0 で埋める（欠測と 0 件を折れ線上で区別できるようにするため）。
 * unresolvedCumulative はその日までの検知累計 - 解決累計で、範囲外で検知され範囲内で
 * 解決されたイベントも解決として数える（負にはならないよう 0 で下限を切る）。
 */
export function aggregateDriftByDay(
  events: readonly DriftEventTimes[],
  options: AggregateDriftByDayOptions = {},
): DriftHistoryPoint[] {
  const timeZone = options.timeZone ?? DEFAULT_TIMEZONE;
  const detectedByDate = new Map<string, number>();
  const resolvedByDate = new Map<string, number>();
  const allDates: string[] = [];

  for (const ev of events) {
    if (ev.detectedAt) {
      const d = toLocalDateString(ev.detectedAt, timeZone);
      detectedByDate.set(d, (detectedByDate.get(d) ?? 0) + 1);
      allDates.push(d);
    }
    if (ev.resolvedAt) {
      const d = toLocalDateString(ev.resolvedAt, timeZone);
      resolvedByDate.set(d, (resolvedByDate.get(d) ?? 0) + 1);
      allDates.push(d);
    }
  }

  const startDate = options.sinceIso
    ? toLocalDateString(options.sinceIso, timeZone)
    : allDates.length
      ? allDates.reduce((a, b) => (a < b ? a : b))
      : null;
  const endDate = options.untilIso
    ? toLocalDateString(options.untilIso, timeZone)
    : allDates.length
      ? allDates.reduce((a, b) => (a > b ? a : b))
      : null;
  if (!startDate || !endDate || startDate > endDate) return [];

  let cumulative = 0;
  return enumerateDates(startDate, endDate).map((date) => {
    const detectedCount = detectedByDate.get(date) ?? 0;
    const resolvedCount = resolvedByDate.get(date) ?? 0;
    cumulative = Math.max(0, cumulative + detectedCount - resolvedCount);
    return { date, detectedCount, resolvedCount, unresolvedCumulative: cumulative };
  });
}
