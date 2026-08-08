export interface FileHotspotRow {
  readonly filePath: string;
  readonly churn: number;
}

export interface HotspotEntry {
  readonly elementId: string;
  readonly churn: number;
  readonly churnNorm: number;
  readonly complexity: number;
  readonly complexityNorm: number;
  readonly risk: number;
}

export type HotspotMap = ReadonlyMap<string, HotspotEntry>;

export interface ActivityHeatmapRow {
  readonly rowKey: string;
  readonly filePath: string;
  readonly count: number;
}

export interface HeatmapAxis {
  readonly id: string;
  readonly label: string;
  readonly group?: string;
}

export interface HeatmapCell {
  readonly rowIndex: number;
  readonly colIndex: number;
  readonly value: number;
}

export interface HeatmapMatrix {
  readonly rows: readonly HeatmapAxis[];
  readonly columns: readonly HeatmapAxis[];
  readonly cells: readonly HeatmapCell[];
  readonly maxValue: number;
}

export interface ActivityTrendRow {
  readonly committedAt: string;
  readonly filePath: string;
  readonly subagentType?: string | null;
}

export type TrendBucketSize = '1d' | '1w' | '1M';

export interface TrendBucket {
  readonly date: string;
  readonly count: number;
}

export type TrendPeriod = '7d' | '30d' | '90d' | 'all';

export type TrendGranularity = 'commit' | 'session' | 'subagent';

export type HotspotGranularity = 'commit' | 'session';

export type ActivityTrend =
  | { readonly type: 'single-series'; readonly bucketSize: TrendBucketSize; readonly buckets: readonly TrendBucket[] }
  | {
      readonly type: 'multi-series';
      readonly bucketSize: TrendBucketSize;
      readonly series: readonly { readonly key: string; readonly buckets: readonly TrendBucket[] }[];
    };
