export interface UsageRecord {
  readonly providerId: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly callCount: number;
  readonly periodStart: string;
  readonly lastUpdatedAt: string;
}

export interface ThresholdEvent {
  readonly providerId: string;
  readonly totalTokens: number;
  readonly threshold: number;
}
