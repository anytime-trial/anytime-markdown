export type DoraLevel = 'elite' | 'high' | 'medium' | 'low';

export type MetricId =
  | 'deploymentFrequency'
  | 'leadTimePerLoc'
  | 'tokensPerLoc'
  | 'aiFirstTrySuccessRate'
  | 'changeFailureRate'
  | 'meanTimeToRecovery'
  | 'taskCompletionRate';

export interface MetricValue {
  id: MetricId;
  value: number;
  unit: 'perDay' | 'hours' | 'percent' | 'minPerLoc' | 'tokensPerLoc';
  sampleSize: number;
  level?: DoraLevel;
  comparison?: {
    previousValue: number;
    deltaPct: number | null;
  };
  timeSeries: Array<{ bucketStart: string; value: number }>;
}

export interface DateRange {
  from: string; // UTC ISO 8601
  to: string;   // UTC ISO 8601
}

export interface UnmeasuredMetric {
  id: string;
  phase: string;
  reason: string;
}

export interface QualityMetrics {
  range: DateRange;
  previousRange: DateRange;
  bucket: 'day' | 'week';
  metrics: {
    deploymentFrequency: MetricValue;
    leadTimePerLoc: MetricValue;
    tokensPerLoc: MetricValue;
    aiFirstTrySuccessRate: MetricValue;
    changeFailureRate: MetricValue;
    meanTimeToRecovery: MetricValue;
    taskCompletionRate: MetricValue;
  };
  unmeasured: UnmeasuredMetric[];
  costPerLocTimeSeries?: ReadonlyArray<{ bucketStart: string; value: number }>;
  leadTimeMinTimeSeries?: ReadonlyArray<{ bucketStart: string; value: number }>;
  leadTimeUnmappedTimeSeries?: ReadonlyArray<{ bucketStart: string; value: number }>;
  leadTimeMinByPrefix?: {
    prefixes: ReadonlyArray<string>;
    series: ReadonlyArray<{ bucketStart: string; byPrefix: Readonly<Record<string, number>> }>;
  };
}
