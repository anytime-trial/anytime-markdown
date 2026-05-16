import {
  DEFAULT_SEVERITY,
  THRESHOLDS,
  decideSeverity,
  isExcludedFromDrift,
  isInfoLevelExcluded,
} from '../../src/drift/policy';

describe('drift/policy', () => {
  describe('THRESHOLDS サニティチェック', () => {
    it('minConfidence = 0.6', () => {
      expect(THRESHOLDS.minConfidence).toBe(0.6);
    });

    it('regressionWindowDays = 90', () => {
      expect(THRESHOLDS.regressionWindowDays).toBe(90);
    });

    it('f22CosineThreshold = 0.85', () => {
      expect(THRESHOLDS.f22CosineThreshold).toBe(0.85);
    });
  });

  describe('DEFAULT_SEVERITY', () => {
    it('U9: regression_cluster → error', () => {
      expect(DEFAULT_SEVERITY.regression_cluster).toBe('error');
    });

    it('U21: spec_clarification_recurring → warn', () => {
      expect(DEFAULT_SEVERITY.spec_clarification_recurring).toBe('warn');
    });
  });

  describe('decideSeverity', () => {
    it('U5: predicate=relates_to → info', () => {
      expect(decideSeverity('spec_vs_code', 'relates_to', 0.9)).toBe('info');
    });

    it('U6: confidence=0.5 → info', () => {
      expect(decideSeverity('spec_vs_code', 'implements', 0.5)).toBe('info');
    });

    it('U10: regression_cluster + confidence=0.7 → error', () => {
      expect(decideSeverity('regression_cluster', 'caused_by', 0.7)).toBe('error');
    });

    it('U15: review_unfixed + severity warn + confidence=0.8 → warn', () => {
      expect(decideSeverity('review_unfixed', 'implements', 0.8)).toBe('warn');
    });

    it('U22: review_vs_code + overlap.spec_vs_code=true → info', () => {
      expect(decideSeverity('review_vs_code', 'implements', 0.9, { spec_vs_code: true })).toBe(
        'info',
      );
    });

    it('U23: review_vs_code + overlap.spec_vs_code=false → warn', () => {
      expect(
        decideSeverity('review_vs_code', 'implements', 0.9, { spec_vs_code: false }),
      ).toBe('warn');
    });

    it('U23b: review_vs_code + overlap 省略 → warn', () => {
      expect(decideSeverity('review_vs_code', 'implements', 0.9)).toBe('warn');
    });
  });

  describe('isExcludedFromDrift', () => {
    it('U6b: confidence=0.5 → true', () => {
      expect(isExcludedFromDrift('implements', 0.5)).toBe(true);
    });

    it('predicate=relates_to → true', () => {
      expect(isExcludedFromDrift('relates_to', 0.9)).toBe(true);
    });

    it('predicate=implements + confidence=0.7 → false', () => {
      expect(isExcludedFromDrift('implements', 0.7)).toBe(false);
    });
  });

  describe('isInfoLevelExcluded', () => {
    it('U14: review_unfixed + severity=info → true', () => {
      expect(isInfoLevelExcluded('review_unfixed', 'info')).toBe(true);
    });

    it('review_unfixed + severity=warn → false', () => {
      expect(isInfoLevelExcluded('review_unfixed', 'warn')).toBe(false);
    });

    it('spec_vs_code + severity=info → false', () => {
      expect(isInfoLevelExcluded('spec_vs_code', 'info')).toBe(false);
    });
  });
});
