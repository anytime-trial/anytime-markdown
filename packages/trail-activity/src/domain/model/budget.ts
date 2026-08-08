export interface TokenBudgetConfig {
  readonly dailyLimitTokens: number | null;
  readonly sessionLimitTokens: number | null;
  readonly alertThresholdPct: number;
}

export interface TokenBudgetStatus {
  readonly sessionId: string;
  readonly sessionTokens: number;
  readonly dailyTokens: number;
  readonly dailyLimitTokens: number | null;
  readonly sessionLimitTokens: number | null;
  readonly alertThresholdPct: number;
}
