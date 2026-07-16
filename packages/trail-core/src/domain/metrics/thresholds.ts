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
  meanTimeToRecovery: ThresholdLevels;
  taskCompletionRate: ThresholdLevels;
}

export const DEFAULT_THRESHOLDS: ThresholdsConfig = {
  deploymentFrequency: { elite: 1, high: 1 / 7, medium: 1 / 30 },
  leadTimePerLoc: { elite: 1, high: 5, medium: 20 },        // min/LOC, smaller is better
  tokensPerLoc: { elite: 5_000, high: 20_000, medium: 100_000 }, // tokens/LOC (4-type sum incl. cache_read), smaller is better
  changeFailureRate: { elite: 15, high: 30, medium: 45 },
  aiFirstTrySuccessRate: { elite: 80, high: 60, medium: 40 },
  meanTimeToRecovery: { elite: 1, high: 24, medium: 168 },   // hours, smaller is better (DORA: 1h / 1day / 1week)
  taskCompletionRate: { elite: 90, high: 75, medium: 50 },
};

/** Classify value where higher is better (value >= threshold). */
function classifyHigherIsBetter(value: number, t: ThresholdLevels): DoraLevel {
  if (value >= t.elite) return 'elite';
  if (value >= t.high) return 'high';
  if (value >= t.medium) return 'medium';
  return 'low';
}

/** Classify value where lower is better (value < threshold, strict). */
function classifyLowerIsBetterStrict(value: number, t: ThresholdLevels): DoraLevel {
  if (value < t.elite) return 'elite';
  if (value < t.high) return 'high';
  if (value < t.medium) return 'medium';
  return 'low';
}

/** Classify value where lower is better (value <= threshold, inclusive). */
function classifyLowerIsBetterInclusive(value: number, t: ThresholdLevels): DoraLevel {
  if (value <= t.elite) return 'elite';
  if (value <= t.high) return 'high';
  if (value <= t.medium) return 'medium';
  return 'low';
}

export function classifyDoraLevel(
  metricId: MetricId,
  value: number,
  thresholds: ThresholdsConfig = DEFAULT_THRESHOLDS,
): DoraLevel | undefined {
  switch (metricId) {
    case 'deploymentFrequency':
      return classifyHigherIsBetter(value, thresholds.deploymentFrequency);
    case 'leadTimePerLoc':
      return classifyLowerIsBetterStrict(value, thresholds.leadTimePerLoc);
    case 'tokensPerLoc':
      return classifyLowerIsBetterStrict(value, thresholds.tokensPerLoc);
    case 'changeFailureRate':
      return classifyLowerIsBetterInclusive(value, thresholds.changeFailureRate);
    case 'aiFirstTrySuccessRate':
      return classifyHigherIsBetter(value, thresholds.aiFirstTrySuccessRate);
    case 'meanTimeToRecovery':
      return classifyLowerIsBetterStrict(value, thresholds.meanTimeToRecovery);
    case 'taskCompletionRate':
      return classifyHigherIsBetter(value, thresholds.taskCompletionRate);
    default:
      return undefined;
  }
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
    meanTimeToRecovery: mergeLevel(user.meanTimeToRecovery, defaults.meanTimeToRecovery),
    taskCompletionRate: mergeLevel(user.taskCompletionRate, defaults.taskCompletionRate),
  };
}
