import type { DoraLevel, MetricId } from './types';

export interface ThresholdLevels {
  elite: number;
  high: number;
  medium: number;
}

export interface ThresholdsConfig {
  deploymentFrequency: ThresholdLevels;
  leadTimePerLoc: ThresholdLevels;
  tokensPerLoc: ThresholdLevels;
  changeFailureRate: ThresholdLevels;
  aiFirstTrySuccessRate: ThresholdLevels;
}

export const DEFAULT_THRESHOLDS: ThresholdsConfig = {
  deploymentFrequency: { elite: 1, high: 1 / 7, medium: 1 / 30 },
  leadTimePerLoc: { elite: 1, high: 5, medium: 20 },        // min/LOC, smaller is better
  tokensPerLoc: { elite: 2_000, high: 10_000, medium: 50_000 }, // tokens/LOC, smaller is better
  changeFailureRate: { elite: 15, high: 30, medium: 45 },
  aiFirstTrySuccessRate: { elite: 80, high: 60, medium: 40 },
};

export function classifyDoraLevel(
  metricId: MetricId,
  value: number,
  thresholds: ThresholdsConfig = DEFAULT_THRESHOLDS,
): DoraLevel | undefined {
  if (metricId === 'deploymentFrequency') {
    const t = thresholds.deploymentFrequency;
    if (value >= t.elite) return 'elite';
    if (value >= t.high) return 'high';
    if (value >= t.medium) return 'medium';
    return 'low';
  }

  if (metricId === 'leadTimePerLoc') {
    const t = thresholds.leadTimePerLoc;
    if (value < t.elite) return 'elite';
    if (value < t.high) return 'high';
    if (value < t.medium) return 'medium';
    return 'low';
  }

  if (metricId === 'tokensPerLoc') {
    const t = thresholds.tokensPerLoc;
    if (value < t.elite) return 'elite';
    if (value < t.high) return 'high';
    if (value < t.medium) return 'medium';
    return 'low';
  }

  if (metricId === 'changeFailureRate') {
    const t = thresholds.changeFailureRate;
    if (value <= t.elite) return 'elite';
    if (value <= t.high) return 'high';
    if (value <= t.medium) return 'medium';
    return 'low';
  }

  if (metricId === 'aiFirstTrySuccessRate') {
    const t = thresholds.aiFirstTrySuccessRate;
    if (value >= t.elite) return 'elite';
    if (value >= t.high) return 'high';
    if (value >= t.medium) return 'medium';
    return 'low';
  }

  return undefined;
}

function isValidPositive(v: number): boolean {
  return !Number.isNaN(v) && v >= 0;
}

export function mergeThresholds(
  user: Partial<ThresholdsConfig> | undefined,
  defaults: ThresholdsConfig,
): ThresholdsConfig {
  if (!user) return defaults;

  const mergeLevel = (
    userLevel: ThresholdLevels | undefined,
    defaultLevel: ThresholdLevels,
  ): ThresholdLevels => {
    if (!userLevel) return defaultLevel;
    return {
      elite: isValidPositive(userLevel.elite) ? userLevel.elite : defaultLevel.elite,
      high: isValidPositive(userLevel.high) ? userLevel.high : defaultLevel.high,
      medium: isValidPositive(userLevel.medium) ? userLevel.medium : defaultLevel.medium,
    };
  };

  return {
    deploymentFrequency: mergeLevel(user.deploymentFrequency, defaults.deploymentFrequency),
    leadTimePerLoc: mergeLevel(user.leadTimePerLoc, defaults.leadTimePerLoc),
    tokensPerLoc: mergeLevel(user.tokensPerLoc, defaults.tokensPerLoc),
    changeFailureRate: mergeLevel(user.changeFailureRate, defaults.changeFailureRate),
    aiFirstTrySuccessRate: mergeLevel(user.aiFirstTrySuccessRate, defaults.aiFirstTrySuccessRate),
  };
}
