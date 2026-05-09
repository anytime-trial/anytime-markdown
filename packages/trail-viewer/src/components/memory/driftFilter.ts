import type { MemoryDriftEventRow } from '../../data/types';

export interface DriftFilterParams {
  readonly unresolvedOnly: boolean;
  readonly severityFilter: string;
  readonly typeFilter: string;
}

export function filterDriftRows(
  rows: readonly MemoryDriftEventRow[],
  params: DriftFilterParams,
): readonly MemoryDriftEventRow[] {
  return rows.filter((r) => {
    if (params.unresolvedOnly && r.resolvedAt !== null) return false;
    if (params.severityFilter && r.severity !== params.severityFilter) return false;
    if (params.typeFilter && r.driftType !== params.typeFilter) return false;
    return true;
  });
}
