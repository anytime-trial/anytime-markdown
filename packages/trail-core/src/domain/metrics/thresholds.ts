import type { DoraLevel, MetricId } from './types';

export interface ThresholdLevels {
  elite: number;
  high: number;
  medium: number;
}

export interface ThresholdsConfig {
  deploymentFrequency: ThresholdLevels;
  leadTimeForChanges: ThresholdLevels;
  changeFailureRate: ThresholdLevels;
}

export const DEFAULT_THRESHOLDS: ThresholdsConfig = {
  deploymentFrequency: { elite: 1, high: 1 / 7, medium: 1 / 30 },
  leadTimeForChanges: { elite: 24, high: 168, medium: 720 },
  changeFailureRate: { elite: 15, high: 30, medium: 45 },
};

export function classifyDoraLevel(
  metricId: MetricId,
  value: number,
  thresholds: ThresholdsConfig = DEFAULT_THRESHOLDS,
): DoraLevel | undefined {
  if (metricId === 'promptToCommitSuccessRate') return undefined;

  if (metricId === 'deploymentFrequency') {
    const t = thresholds.deploymentFrequency;
    if (value >= t.elite) return 'elite';
    if (value >= t.high) return 'high';
    if (value >= t.medium) return 'medium';
    return 'low';
  }

  if (metricId === 'leadTimeForChanges') {
    const t = thresholds.leadTimeForChanges;
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
    leadTimeForChanges: mergeLevel(user.leadTimeForChanges, defaults.leadTimeForChanges),
    changeFailureRate: mergeLevel(user.changeFailureRate, defaults.changeFailureRate),
  };
}
