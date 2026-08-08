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
  const startBoundary = options.sinceIso ? toLocalDateString(options.sinceIso, timeZone) : null;
  // 範囲開始時点で既に未解決だった件数。これを累計の初期値にしないと、開始日より前から
  // 残っているバックログが 0 件として描画される（範囲内の増減しか見えない）。
  let carriedUnresolved = 0;

  for (const ev of events) {
    const detectedDate = ev.detectedAt ? toLocalDateString(ev.detectedAt, timeZone) : null;
    const resolvedDate = ev.resolvedAt ? toLocalDateString(ev.resolvedAt, timeZone) : null;

    // 範囲開始前に検知され、開始時点でまだ解決していないものを繰り越す
    if (
      startBoundary !== null &&
      detectedDate !== null &&
      detectedDate < startBoundary &&
      (resolvedDate === null || resolvedDate >= startBoundary)
    ) {
      carriedUnresolved += 1;
    }

    if (detectedDate !== null) {
      detectedByDate.set(detectedDate, (detectedByDate.get(detectedDate) ?? 0) + 1);
      allDates.push(detectedDate);
    }
    if (resolvedDate !== null) {
      resolvedByDate.set(resolvedDate, (resolvedByDate.get(resolvedDate) ?? 0) + 1);
      allDates.push(resolvedDate);
    }
  }

  const startDate = options.sinceIso
    ? toLocalDateString(options.sinceIso, timeZone)
    : allDates.length
      ? allDates.reduce((a, b) => (a < b ? a : b), allDates[0])
      : null;
  const endDate = options.untilIso
    ? toLocalDateString(options.untilIso, timeZone)
    : allDates.length
      ? allDates.reduce((a, b) => (a > b ? a : b), allDates[0])
      : null;
  if (!startDate || !endDate || startDate > endDate) return [];

  let cumulative = carriedUnresolved;
  return enumerateDates(startDate, endDate).map((date) => {
    const detectedCount = detectedByDate.get(date) ?? 0;
    const resolvedCount = resolvedByDate.get(date) ?? 0;
    cumulative = Math.max(0, cumulative + detectedCount - resolvedCount);
    return { date, detectedCount, resolvedCount, unresolvedCumulative: cumulative };
  });
}
