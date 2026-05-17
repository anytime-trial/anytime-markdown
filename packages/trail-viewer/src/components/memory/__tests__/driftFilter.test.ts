import { computeFixTarget, filterDriftRows } from '../driftFilter';
import type { MemoryDriftEventRow } from '../../../data/types';

function makeRow(overrides: Partial<MemoryDriftEventRow>): MemoryDriftEventRow {
  return {
    id: 'r1',
    subjectEntityId: 'e1',
    subjectDisplayName: 'Entity 1',
    predicate: 'has_impl',
    driftType: 'spec_vs_code',
    severity: 'warn',
    conversationValue: null,
    specValue: null,
    codeValue: null,
    detectedAt: '2026-01-01T00:00:00.000Z',
    resolvedAt: null,
    resolutionNote: '',
    ...overrides,
  };
}

const warnOpen = makeRow({ id: 'warn-open' });
const resolved = makeRow({ id: 'resolved', resolvedAt: '2026-01-02T00:00:00.000Z' });
const errorRow = makeRow({ id: 'err', severity: 'error' });
const infoRow = makeRow({ id: 'info', severity: 'info', driftType: 'spec_vs_db' });
const rows = [warnOpen, resolved, errorRow, infoRow];

describe('computeFixTarget', () => {
  it.each([
    ['spec_vs_code', 'code'],
    ['conv_vs_code', 'code'],
    ['three_way', 'code'],
    ['regression_cluster', 'code'],
    ['spec_violation_cluster', 'code'],
    ['recurring_root_cause', 'code'],
    ['review_unfixed', 'code'],
    ['review_vs_code', 'code'],
    ['recurring_review_finding', 'code'],
  ] as const)('maps %s -> %s (code-fix priority)', (driftType, expected) => {
    expect(computeFixTarget(driftType)).toBe(expected);
  });

  it('maps conv_vs_spec -> spec (spec needs to follow conversation)', () => {
    expect(computeFixTarget('conv_vs_spec')).toBe('spec');
  });

  it('maps spec_clarification_recurring -> spec (spec ambiguity drives repeated questions)', () => {
    expect(computeFixTarget('spec_clarification_recurring')).toBe('spec');
  });

  it('falls back to code for unknown drift_type so unmapped detectors stay visible under the default filter', () => {
    expect(computeFixTarget('some_future_drift_type')).toBe('code');
  });
});

describe('filterDriftRows', () => {
  it('returns all rows when no filters active', () => {
    expect(filterDriftRows(rows, { unresolvedOnly: false, severityFilter: '', typeFilter: '', fixTargetFilter: '' })).toHaveLength(4);
  });

  it('filters by fixTarget=code (most drift types map here)', () => {
    const result = filterDriftRows(rows, { unresolvedOnly: false, severityFilter: '', typeFilter: '', fixTargetFilter: 'code' });
    // warnOpen / resolved / errorRow / infoRow — infoRow has driftType=spec_vs_db (unknown -> code), others spec_vs_code -> code
    expect(result).toHaveLength(4);
  });

  it('filters by fixTarget=spec (excludes code-target rows)', () => {
    const specRow = makeRow({ id: 'spec-target', driftType: 'conv_vs_spec' });
    const result = filterDriftRows([...rows, specRow], { unresolvedOnly: false, severityFilter: '', typeFilter: '', fixTargetFilter: 'spec' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('spec-target');
  });

  it('returns empty array when fixTarget filter does not match any row', () => {
    // No current detector emits Conv fix target — filter returns 0 rows
    const result = filterDriftRows(rows, { unresolvedOnly: false, severityFilter: '', typeFilter: '', fixTargetFilter: 'conv' });
    expect(result).toHaveLength(0);
  });
});

describe('filterDriftRows (existing filters)', () => {

  it('excludes resolved rows when unresolvedOnly is true', () => {
    const result = filterDriftRows(rows, { unresolvedOnly: true, severityFilter: '', typeFilter: '', fixTargetFilter: '' });
    expect(result.some((r) => r.id === 'resolved')).toBe(false);
    expect(result).toHaveLength(3);
  });

  it('filters by severity', () => {
    const result = filterDriftRows(rows, { unresolvedOnly: false, severityFilter: 'error', typeFilter: '', fixTargetFilter: '' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('err');
  });

  it('filters by driftType', () => {
    const result = filterDriftRows(rows, { unresolvedOnly: false, severityFilter: '', typeFilter: 'spec_vs_db', fixTargetFilter: '' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('info');
  });

  it('combines unresolvedOnly and severity filters', () => {
    const result = filterDriftRows(rows, { unresolvedOnly: true, severityFilter: 'warn', typeFilter: '', fixTargetFilter: '' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('warn-open');
  });

  it('returns empty array when no rows match', () => {
    const result = filterDriftRows(rows, { unresolvedOnly: false, severityFilter: 'info', typeFilter: 'spec_vs_code', fixTargetFilter: '' });
    expect(result).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(filterDriftRows([], { unresolvedOnly: true, severityFilter: 'error', typeFilter: 'spec_vs_code', fixTargetFilter: '' })).toHaveLength(0);
  });
});
