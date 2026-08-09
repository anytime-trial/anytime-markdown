export type DriftType =
  | 'spec_vs_code'
  | 'conv_vs_code'
  | 'conv_vs_spec'
  | 'three_way'
  | 'regression_cluster'
  | 'spec_violation_cluster'
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
  review_unfixed: 'warn',
  review_vs_code: 'warn',
  recurring_review_finding: 'warn',
  spec_clarification_recurring: 'warn',
};

/**
 * コード構造由来で、複数ソース間の値比較に意味を持たない述語。
 *
 * drift は「同じ (subject, predicate) を spec / review / code が違う値で主張している」ことを
 * 見る仕組みだが、これらはファイル対の構造事実であって主張の食い違いを持たない。
 * migration 029 で call / inheritance が `relates_to` から `calls` / `extends` へ分かれた際、
 * 除外リストが `relates_to` 決め打ちのままだと、意図せず網から外れる。
 */
export const CODE_STRUCTURAL_PREDICATES = ['relates_to', 'calls', 'extends', 'defines'] as const;

export const THRESHOLDS = {
  minConfidence: 0.6,
  excludePredicates: [...CODE_STRUCTURAL_PREDICATES],

  // regression_cluster
  regressionWindowDays: 90,
  regressionMinCount: 2,

  // spec_violation_cluster
  specViolationWindowDays: 90,
  specViolationMinCount: 3,
  specViolationMinRatio: 0.3,

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
  // コード構造由来の述語は info 降格（compare 段階で除外されるが二重防御）
  if ((CODE_STRUCTURAL_PREDICATES as readonly string[]).includes(predicate)) return 'info';
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
