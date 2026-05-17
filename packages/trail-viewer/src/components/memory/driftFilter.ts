import type { MemoryDriftEventRow } from '../../data/types';

export type FixTarget = 'code' | 'spec' | 'conv';

/**
 * Map a drift_type to the source that should be fixed. Priority is code > spec > conv:
 * conversation is treated as the source of truth (= user instructions), so the diverging
 * side — code first, then spec — is what needs fixing. Unknown types default to code so
 * future detectors stay visible under the default filter.
 */
const FIX_TARGET_BY_DRIFT_TYPE: Record<string, FixTarget> = {
  spec_vs_code: 'code',
  conv_vs_code: 'code',
  conv_vs_spec: 'spec',
  three_way: 'code',
  regression_cluster: 'code',
  spec_violation_cluster: 'code',
  recurring_root_cause: 'code',
  review_unfixed: 'code',
  review_vs_code: 'code',
  recurring_review_finding: 'code',
  spec_clarification_recurring: 'spec',
};

export function computeFixTarget(driftType: string): FixTarget {
  return FIX_TARGET_BY_DRIFT_TYPE[driftType] ?? 'code';
}

export interface DriftFilterParams {
  readonly unresolvedOnly: boolean;
  readonly severityFilter: string;
  readonly typeFilter: string;
  readonly fixTargetFilter: string;
}

export function filterDriftRows(
  rows: readonly MemoryDriftEventRow[],
  params: DriftFilterParams,
): readonly MemoryDriftEventRow[] {
  return rows.filter((r) => {
    if (params.unresolvedOnly && r.resolvedAt !== null) return false;
    if (params.severityFilter && r.severity !== params.severityFilter) return false;
    if (params.typeFilter && r.driftType !== params.typeFilter) return false;
    if (params.fixTargetFilter && computeFixTarget(r.driftType) !== params.fixTargetFilter) return false;
    return true;
  });
}
