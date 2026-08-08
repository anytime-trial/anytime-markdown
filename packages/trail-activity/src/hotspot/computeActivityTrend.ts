import type { C4Model } from '../c4/types';
import { collectDescendantIds } from '../c4/view/collectDescendants';
import {
  enumerateBuckets,
  floorToBucketStart,
  pickBucketSize,
  toLocalDateString,
} from './bucketing';
import { elementIdToFilePath, isCodeElement } from './pathIndex';
import type {
  ActivityTrend,
  ActivityTrendRow,
  TrendBucket,
  TrendGranularity,
  TrendPeriod,
} from './types';

const DEFAULT_TIMEZONE = 'Asia/Tokyo';
const DEFAULT_SUBAGENT_TOP_K = 5;

export interface ComputeTrendInput {
  readonly rows: readonly ActivityTrendRow[];
  readonly elementId: string;
  readonly granularity: TrendGranularity;
  readonly period: TrendPeriod;
  readonly from: string;
  readonly to: string;
  readonly c4Model: C4Model;
  readonly timeZone?: string;
  readonly subagentTopK?: number;
}

function collectDescendantFilePaths(elementId: string, c4Model: C4Model): Set<string> {
  const result = new Set<string>();
  const elementById = new Map(c4Model.elements.map((el) => [el.id, el] as const));
  const target = elementById.get(elementId);
  if (target && isCodeElement(target)) {
    const path = elementIdToFilePath(target.id);
    if (path) result.add(path);
    return result;
  }
  const descendantIds = collectDescendantIds(c4Model.elements, elementId);
  for (const id of descendantIds) {
    const el = elementById.get(id);
    if (el && isCodeElement(el)) {
      const path = elementIdToFilePath(el.id);
      if (path) result.add(path);
    }
  }
  return result;
}

function buildEmptyBuckets(bucketKeys: readonly string[]): TrendBucket[] {
  return bucketKeys.map((date) => ({ date, count: 0 }));
}

function incrementBucket(
  buckets: TrendBucket[],
  bucketIndex: ReadonlyMap<string, number>,
  bucketKey: string,
): void {
  const idx = bucketIndex.get(bucketKey);
  if (idx === undefined) return;
  const prev = buckets[idx];
  buckets[idx] = { date: prev.date, count: prev.count + 1 };
}

export function computeActivityTrend(input: ComputeTrendInput): ActivityTrend {
  const {
    rows,
    elementId,
    granularity,
    period,
    from,
    to,
    c4Model,
    timeZone = DEFAULT_TIMEZONE,
    subagentTopK = DEFAULT_SUBAGENT_TOP_K,
  } = input;

  const targetPaths = collectDescendantFilePaths(elementId, c4Model);
  const filtered = rows.filter((r) => targetPaths.has(r.filePath));

  const bucketSize = pickBucketSize(period);
  const bucketKeys = enumerateBuckets(from, to, bucketSize, timeZone);
  const bucketIndex = new Map(bucketKeys.map((k, i) => [k, i] as const));

  if (granularity !== 'subagent') {
    const buckets = buildEmptyBuckets(bucketKeys);
    for (const r of filtered) {
      const localDate = toLocalDateString(r.committedAt, timeZone);
      const key = floorToBucketStart(localDate, bucketSize);
      incrementBucket(buckets, bucketIndex, key);
    }
    return { type: 'single-series', bucketSize, buckets };
  }

  const totalsByType = new Map<string, number>();
  const bucketsByType = new Map<string, TrendBucket[]>();
  for (const r of filtered) {
    const key = r.subagentType ?? 'unknown';
    totalsByType.set(key, (totalsByType.get(key) ?? 0) + 1);
    const localDate = toLocalDateString(r.committedAt, timeZone);
    const bucketKey = floorToBucketStart(localDate, bucketSize);
    const buckets = bucketsByType.get(key) ?? buildEmptyBuckets(bucketKeys);
    incrementBucket(buckets, bucketIndex, bucketKey);
    bucketsByType.set(key, buckets);
  }

  const seriesKeys = Array.from(totalsByType.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0, Math.max(0, subagentTopK))
    .map(([k]) => k);

  const series = seriesKeys.map((key) => ({
    key,
    buckets: bucketsByType.get(key) ?? buildEmptyBuckets(bucketKeys),
  }));

  return { type: 'multi-series', bucketSize, series };
}
