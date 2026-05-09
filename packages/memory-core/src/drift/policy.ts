export type DriftType =
  | 'spec_vs_code'
  | 'conv_vs_code'
  | 'conv_vs_spec'
  | 'three_way'
  | 'regression_cluster'
  | 'spec_violation_cluster'
  | 'recurring_root_cause'
  | 'review_unfixed'
  | 'review_vs_code'
  | 'recurring_review_finding'
  | 'spec_clarification_recurring';

export type Severity = 'info' | 'warn' | 'error';

export const DEFAULT_SEVERITY: Record<DriftType, Severity> = {
  spec_vs_code: 'error',
  conv_vs_code: 'warn',
  conv_vs_spec: 'warn',
  three_way: 'error',
  regression_cluster: 'error',
  spec_violation_cluster: 'warn',
  recurring_root_cause: 'warn',
  review_unfixed: 'warn',
  review_vs_code: 'warn',
  recurring_review_finding: 'warn',
  spec_clarification_recurring: 'warn',
};

export const THRESHOLDS = {
  minConfidence: 0.6,
  excludePredicates: ['relates_to'],

  // regression_cluster
  regressionWindowDays: 90,
  regressionMinCount: 2,

  // spec_violation_cluster
  specViolationWindowDays: 90,
  specViolationMinCount: 3,
  specViolationMinRatio: 0.3,

  // recurring_root_cause
  recurringRootCauseMinBugs: 2,

  // review_unfixed
  reviewUnfixedDays: 30,
  reviewUnfixedMinSeverity: 'warn' as Severity,

  // recurring_review_finding
  recurringReviewWindowDays: 90,
  recurringReviewMinCount: 2,
  recurringReviewExcludeCategories: ['other'],

  // spec_clarification_recurring (F22)
  f22WindowDays: 90,
  f22MinCount: 2,
  f22CosineThreshold: 0.85,
} as const;

export function decideSeverity(
  drift_type: DriftType,
  predicate: string,
  confidence: number,
  overlap: { spec_vs_code?: boolean } = {},
): Severity {
  // predicate='relates_to' は info 降格（compare 段階で除外されるが二重防御）
  if (predicate === 'relates_to') return 'info';
  // review_vs_code が spec_vs_code と重複時は info 降格
  if (drift_type === 'review_vs_code' && overlap.spec_vs_code) return 'info';
  // confidence 低い場合は降格
  if (confidence < THRESHOLDS.minConfidence) return 'info';
  return DEFAULT_SEVERITY[drift_type];
}

export function isExcludedFromDrift(predicate: string, confidence: number): boolean {
  return (
    (THRESHOLDS.excludePredicates as readonly string[]).includes(predicate) ||
    confidence < THRESHOLDS.minConfidence
  );
}

export function isInfoLevelExcluded(drift_type: DriftType, severity: Severity): boolean {
  // review_unfixed は info 級指摘を対象外
  if (drift_type === 'review_unfixed' && severity === 'info') return true;
  return false;
}
