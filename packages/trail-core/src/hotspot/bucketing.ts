import type { TrendBucketSize, TrendPeriod } from './types';

const DEFAULT_TIMEZONE = 'Asia/Tokyo';
const GMT_OFFSET_RE = /^GMT([+-])(\d{1,2}):(\d{2})$/;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

export function pickBucketSize(period: TrendPeriod): TrendBucketSize {
  if (period === '7d') return '1d';
  if (period === '30d') return '1d';
  if (period === '90d') return '1w';
  return '1M';
}

export function getTimezoneOffsetMinutes(timeZone: string, at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(at);
  const label = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  const match = GMT_OFFSET_RE.exec(label);
  if (!match) return 0;
  const sign = match[1] === '+' ? 1 : -1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

export function toLocalDateString(utcIso: string, timeZone: string = DEFAULT_TIMEZONE): string {
  const date = new Date(utcIso);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`invalid utc iso: ${utcIso}`);
  }
  const offsetMin = getTimezoneOffsetMinutes(timeZone, date);
  const shifted = new Date(date.getTime() + offsetMin * MS_PER_MINUTE);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateString(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDateUtc(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function floorToWeekStart(d: Date): Date {
  const day = d.getUTCDay();
  const offsetToMonday = (day + 6) % 7;
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() - offsetToMonday);
  return out;
}

function floorToMonthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function floorToBucketStart(localDate: string, bucketSize: TrendBucketSize): string {
  const d = parseDateString(localDate);
  if (bucketSize === '1d') return localDate;
  if (bucketSize === '1w') return formatDateUtc(floorToWeekStart(d));
  return formatDateUtc(floorToMonthStart(d));
}

export function enumerateBuckets(
  fromUtcIso: string,
  toUtcIso: string,
  bucketSize: TrendBucketSize,
  timeZone: string = DEFAULT_TIMEZONE,
): string[] {
  const fromLocal = toLocalDateString(fromUtcIso, timeZone);
  const toLocal = toLocalDateString(toUtcIso, timeZone);
  const start = parseDateString(floorToBucketStart(fromLocal, bucketSize));
  const end = parseDateString(floorToBucketStart(toLocal, bucketSize));
  const out: string[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(formatDateUtc(cur));
    cur = advance(cur, bucketSize);
  }
  return out;
}

function advance(d: Date, bucketSize: TrendBucketSize): Date {
  if (bucketSize === '1d') return new Date(d.getTime() + MS_PER_DAY);
  if (bucketSize === '1w') return new Date(d.getTime() + 7 * MS_PER_DAY);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}
