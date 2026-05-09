import { filterDriftRows } from '../driftFilter';
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

describe('filterDriftRows', () => {
  it('returns all rows when no filters active', () => {
    expect(filterDriftRows(rows, { unresolvedOnly: false, severityFilter: '', typeFilter: '' })).toHaveLength(4);
  });

  it('excludes resolved rows when unresolvedOnly is true', () => {
    const result = filterDriftRows(rows, { unresolvedOnly: true, severityFilter: '', typeFilter: '' });
    expect(result.some((r) => r.id === 'resolved')).toBe(false);
    expect(result).toHaveLength(3);
  });

  it('filters by severity', () => {
    const result = filterDriftRows(rows, { unresolvedOnly: false, severityFilter: 'error', typeFilter: '' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('err');
  });

  it('filters by driftType', () => {
    const result = filterDriftRows(rows, { unresolvedOnly: false, severityFilter: '', typeFilter: 'spec_vs_db' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('info');
  });

  it('combines unresolvedOnly and severity filters', () => {
    const result = filterDriftRows(rows, { unresolvedOnly: true, severityFilter: 'warn', typeFilter: '' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('warn-open');
  });

  it('returns empty array when no rows match', () => {
    const result = filterDriftRows(rows, { unresolvedOnly: false, severityFilter: 'info', typeFilter: 'spec_vs_code' });
    expect(result).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(filterDriftRows([], { unresolvedOnly: true, severityFilter: 'error', typeFilter: 'spec_vs_code' })).toHaveLength(0);
  });
});
