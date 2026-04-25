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

  describe('leadTimePerLoc', () => {
    it('elite: < 1 min/LOC', () => {
      expect(classifyDoraLevel('leadTimePerLoc', 0)).toBe('elite');
      expect(classifyDoraLevel('leadTimePerLoc', 0.99)).toBe('elite');
    });
    it('high: >= 1 and < 5', () => {
      expect(classifyDoraLevel('leadTimePerLoc', 1)).toBe('high');
      expect(classifyDoraLevel('leadTimePerLoc', 4)).toBe('high');
    });
    it('medium: >= 5 and < 20', () => {
      expect(classifyDoraLevel('leadTimePerLoc', 5)).toBe('medium');
      expect(classifyDoraLevel('leadTimePerLoc', 19)).toBe('medium');
    });
    it('low: >= 20', () => {
      expect(classifyDoraLevel('leadTimePerLoc', 20)).toBe('low');
      expect(classifyDoraLevel('leadTimePerLoc', 100)).toBe('low');
    });
  });

  describe('tokensPerLoc', () => {
    it('elite: < 2000', () => {
      expect(classifyDoraLevel('tokensPerLoc', 0)).toBe('elite');
      expect(classifyDoraLevel('tokensPerLoc', 1999)).toBe('elite');
    });
    it('high: >= 2000 and < 10000', () => {
      expect(classifyDoraLevel('tokensPerLoc', 2000)).toBe('high');
      expect(classifyDoraLevel('tokensPerLoc', 9999)).toBe('high');
    });
    it('medium: >= 10000 and < 50000', () => {
      expect(classifyDoraLevel('tokensPerLoc', 10000)).toBe('medium');
      expect(classifyDoraLevel('tokensPerLoc', 49999)).toBe('medium');
    });
    it('low: >= 50000', () => {
      expect(classifyDoraLevel('tokensPerLoc', 50000)).toBe('low');
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

  describe('aiFirstTrySuccessRate', () => {
    it('elite: >= 80', () => {
      expect(classifyDoraLevel('aiFirstTrySuccessRate', 80)).toBe('elite');
      expect(classifyDoraLevel('aiFirstTrySuccessRate', 100)).toBe('elite');
    });
    it('high: >= 60', () => {
      expect(classifyDoraLevel('aiFirstTrySuccessRate', 60)).toBe('high');
      expect(classifyDoraLevel('aiFirstTrySuccessRate', 79.99)).toBe('high');
    });
    it('medium: >= 40', () => {
      expect(classifyDoraLevel('aiFirstTrySuccessRate', 40)).toBe('medium');
      expect(classifyDoraLevel('aiFirstTrySuccessRate', 59.99)).toBe('medium');
    });
    it('low: < 40', () => {
      expect(classifyDoraLevel('aiFirstTrySuccessRate', 39)).toBe('low');
    });
  });

  describe('custom thresholds', () => {
    it('uses custom thresholds when provided', () => {
      const custom: ThresholdsConfig = {
        deploymentFrequency: { elite: 2, high: 1, medium: 0.5 },
        leadTimePerLoc: { elite: 0.5, high: 3, medium: 15 },
        tokensPerLoc: { elite: 1_000, high: 8_000, medium: 40_000 },
        changeFailureRate: { elite: 10, high: 20, medium: 30 },
        aiFirstTrySuccessRate: { elite: 95, high: 80, medium: 65 },
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
    expect(merged.leadTimePerLoc).toEqual(DEFAULT_THRESHOLDS.leadTimePerLoc);
  });

  it('falls back to default for NaN values', () => {
    const user: Partial<ThresholdsConfig> = {
      deploymentFrequency: { elite: Number.NaN, high: 0.5, medium: 0.1 },
    };
    const merged = mergeThresholds(user, DEFAULT_THRESHOLDS);
    expect(merged.deploymentFrequency.elite).toBe(DEFAULT_THRESHOLDS.deploymentFrequency.elite);
    expect(merged.deploymentFrequency.high).toBe(0.5);
  });

  it('falls back to default for negative values in leadTimePerLoc', () => {
    const user: Partial<ThresholdsConfig> = {
      leadTimePerLoc: { elite: -1, high: 5, medium: 20 },
    };
    const merged = mergeThresholds(user, DEFAULT_THRESHOLDS);
    expect(merged.leadTimePerLoc.elite).toBe(DEFAULT_THRESHOLDS.leadTimePerLoc.elite);
  });
});
