import { classifyDoraLevel, DEFAULT_THRESHOLDS } from './thresholds';
import type { ThresholdsConfig } from './thresholds';
import type { DateRange, MetricValue } from './types';
import { buildTimeSeries } from './timeSeriesUtils';

export function computeDeploymentFrequency(
  releases: Array<{ tag_date: string }>,
  range: DateRange,
  previousRange: DateRange,
  bucket: 'day' | 'week',
  previousReleases?: Array<{ tag_date: string }>,
  thresholds: ThresholdsConfig = DEFAULT_THRESHOLDS,
): MetricValue {
  const fromMs = new Date(range.from).getTime();
  const toMs = new Date(range.to).getTime();
  const days = (toMs - fromMs) / 86_400_000;

  const inRange = releases.filter((r) => {
    const t = new Date(r.tag_date).getTime();
    return t >= fromMs && t <= toMs;
  });

  const value = days > 0 ? inRange.length / days : 0;
  const level = classifyDoraLevel('deploymentFrequency', value, thresholds);

  const timeSeries = buildTimeSeries(
    inRange.map((r) => ({ date: r.tag_date, value: 1 })),
    range,
    bucket,
    'sum',
  );

  let comparison: MetricValue['comparison'] | undefined;
  if (previousReleases !== undefined) {
    const prevFromMs = new Date(previousRange.from).getTime();
    const prevToMs = new Date(previousRange.to).getTime();
    const prevDays = (prevToMs - prevFromMs) / 86_400_000;
    const prevInRange = previousReleases.filter((r) => {
      const t = new Date(r.tag_date).getTime();
      return t >= prevFromMs && t <= prevToMs;
    });
    const previousValue = prevDays > 0 ? prevInRange.length / prevDays : 0;
    const deltaPct = previousValue === 0 ? null : ((value - previousValue) / previousValue) * 100;
    comparison = { previousValue, deltaPct };
  }

  return {
    id: 'deploymentFrequency',
    value,
    unit: 'perDay',
    sampleSize: inRange.length,
    level,
    comparison,
    timeSeries,
  };
}
