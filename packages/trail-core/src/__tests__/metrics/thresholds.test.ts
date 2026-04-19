import { classifyDoraLevel, mergeThresholds, DEFAULT_THRESHOLDS } from '../../domain/metrics/thresholds';
import type { ThresholdsConfig } from '../../domain/metrics/thresholds';

describe('classifyDoraLevel', () => {
  describe('deploymentFrequency', () => {
    it('elite: >= 1 per day', () => {
      expect(classifyDoraLevel('deploymentFrequency', 1)).toBe('elite');
      expect(classifyDoraLevel('deploymentFrequency', 2.5)).toBe('elite');
    });
    it('high: >= 1/7 and < 1', () => {
      expect(classifyDoraLevel('deploymentFrequency', 1 / 7)).toBe('high');
      expect(classifyDoraLevel('deploymentFrequency', 0.5)).toBe('high');
    });
    it('medium: >= 1/30 and < 1/7', () => {
      expect(classifyDoraLevel('deploymentFrequency', 1 / 30)).toBe('medium');
      expect(classifyDoraLevel('deploymentFrequency', 0.05)).toBe('medium');
    });
    it('low: < 1/30', () => {
      expect(classifyDoraLevel('deploymentFrequency', 0)).toBe('low');
      expect(classifyDoraLevel('deploymentFrequency', 0.01)).toBe('low');
    });
  });

  describe('leadTimeForChanges', () => {
    it('elite: < 24 hours', () => {
      expect(classifyDoraLevel('leadTimeForChanges', 0)).toBe('elite');
      expect(classifyDoraLevel('leadTimeForChanges', 23.9)).toBe('elite');
    });
    it('high: >= 24 and < 168', () => {
      expect(classifyDoraLevel('leadTimeForChanges', 24)).toBe('high');
      expect(classifyDoraLevel('leadTimeForChanges', 100)).toBe('high');
    });
    it('medium: >= 168 and < 720', () => {
      expect(classifyDoraLevel('leadTimeForChanges', 168)).toBe('medium');
      expect(classifyDoraLevel('leadTimeForChanges', 500)).toBe('medium');
    });
    it('low: >= 720', () => {
      expect(classifyDoraLevel('leadTimeForChanges', 720)).toBe('low');
      expect(classifyDoraLevel('leadTimeForChanges', 1000)).toBe('low');
    });
  });

  describe('changeFailureRate', () => {
    it('elite: <= 15%', () => {
      expect(classifyDoraLevel('changeFailureRate', 0)).toBe('elite');
      expect(classifyDoraLevel('changeFailureRate', 15)).toBe('elite');
    });
    it('high: > 15 and <= 30', () => {
      expect(classifyDoraLevel('changeFailureRate', 16)).toBe('high');
      expect(classifyDoraLevel('changeFailureRate', 30)).toBe('high');
    });
    it('medium: > 30 and <= 45', () => {
      expect(classifyDoraLevel('changeFailureRate', 31)).toBe('medium');
      expect(classifyDoraLevel('changeFailureRate', 45)).toBe('medium');
    });
    it('low: > 45', () => {
      expect(classifyDoraLevel('changeFailureRate', 46)).toBe('low');
    });
  });

  describe('promptToCommitSuccessRate', () => {
    it('returns undefined (no DORA level defined)', () => {
      expect(classifyDoraLevel('promptToCommitSuccessRate', 80)).toBeUndefined();
    });
  });

  describe('custom thresholds', () => {
    it('uses custom thresholds when provided', () => {
      const custom: ThresholdsConfig = {
        deploymentFrequency: { elite: 2, high: 1, medium: 0.5 },
        leadTimeForChanges: { elite: 12, high: 72, medium: 360 },
        changeFailureRate: { elite: 10, high: 20, medium: 30 },
      };
      expect(classifyDoraLevel('deploymentFrequency', 1.5, custom)).toBe('high');
      expect(classifyDoraLevel('deploymentFrequency', 2, custom)).toBe('elite');
    });
  });
});

describe('mergeThresholds', () => {
  it('uses defaults when no user config provided', () => {
    const merged = mergeThresholds(undefined, DEFAULT_THRESHOLDS);
    expect(merged).toEqual(DEFAULT_THRESHOLDS);
  });

  it('merges user values over defaults', () => {
    const user: Partial<ThresholdsConfig> = {
      deploymentFrequency: { elite: 2, high: 0.5, medium: 0.1 },
    };
    const merged = mergeThresholds(user, DEFAULT_THRESHOLDS);
    expect(merged.deploymentFrequency.elite).toBe(2);
    expect(merged.leadTimeForChanges).toEqual(DEFAULT_THRESHOLDS.leadTimeForChanges);
  });

  it('falls back to default for NaN values', () => {
    const user: Partial<ThresholdsConfig> = {
      deploymentFrequency: { elite: Number.NaN, high: 0.5, medium: 0.1 },
    };
    const merged = mergeThresholds(user, DEFAULT_THRESHOLDS);
    expect(merged.deploymentFrequency.elite).toBe(DEFAULT_THRESHOLDS.deploymentFrequency.elite);
    expect(merged.deploymentFrequency.high).toBe(0.5);
  });

  it('falls back to default for negative values in leadTimeForChanges', () => {
    const user: Partial<ThresholdsConfig> = {
      leadTimeForChanges: { elite: -1, high: 168, medium: 720 },
    };
    const merged = mergeThresholds(user, DEFAULT_THRESHOLDS);
    expect(merged.leadTimeForChanges.elite).toBe(DEFAULT_THRESHOLDS.leadTimeForChanges.elite);
  });
});
