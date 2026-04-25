import type { DateRange } from './types';

function startOfDayUTC(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function startOfWeekUTC(ms: number): number {
  const d = new Date(ms);
  const day = d.getUTCDay(); // 0=Sun
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}

export function buildTimeSeries(
  events: Array<{ date: string; value: number }>,
  range: DateRange,
  bucket: 'day' | 'week',
  aggregation: 'sum' | 'median',
): Array<{ bucketStart: string; value: number }> {
  const fromMs = new Date(range.from).getTime();
  const toMs = new Date(range.to).getTime();
  const bucketFn = bucket === 'day' ? startOfDayUTC : startOfWeekUTC;

  // Build bucket map
  const buckets = new Map<number, number[]>();

  // Pre-fill buckets from range start to end
  let cursor = bucketFn(fromMs);
  while (cursor <= toMs) {
    buckets.set(cursor, []);
    cursor += bucket === 'day' ? 86_400_000 : 7 * 86_400_000;
  }

  for (const ev of events) {
    const evMs = new Date(ev.date).getTime();
    if (evMs < fromMs || evMs > toMs) continue;
    const key = bucketFn(evMs);
    const existing = buckets.get(key);
    if (existing) {
      existing.push(ev.value);
    } else {
      buckets.set(key, [ev.value]);
    }
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([ms, vals]) => {
      let value: number;
      if (aggregation === 'sum') {
        value = vals.reduce((s, v) => s + v, 0);
      } else {
        value = median(vals);
      }
      return { bucketStart: new Date(ms).toISOString(), value };
    });
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function buildRatioTimeSeries(
  samples: Array<{ date: string; numerator: number; denominator: number }>,
  range: DateRange,
  bucket: 'day' | 'week',
): Array<{ bucketStart: string; value: number }> {
  const fromMs = new Date(range.from).getTime();
  const toMs = new Date(range.to).getTime();
  const bucketFn = bucket === 'day' ? startOfDayUTC : startOfWeekUTC;

  type Acc = { num: number; den: number };
  const buckets = new Map<number, Acc>();

  let cursor = bucketFn(fromMs);
  while (cursor <= toMs) {
    buckets.set(cursor, { num: 0, den: 0 });
    cursor += bucket === 'day' ? 86_400_000 : 7 * 86_400_000;
  }

  for (const s of samples) {
    const evMs = new Date(s.date).getTime();
    if (evMs < fromMs || evMs > toMs) continue;
    const key = bucketFn(evMs);
    const acc = buckets.get(key);
    if (acc) {
      acc.num += s.numerator;
      acc.den += s.denominator;
    } else {
      buckets.set(key, { num: s.numerator, den: s.denominator });
    }
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([ms, acc]) => ({
      bucketStart: new Date(ms).toISOString(),
      value: acc.den > 0 ? acc.num / acc.den : 0,
    }));
}
