import { buildBugEntity } from '../../../src/ingest/bug-history/buildBugEntity';
import { entityId } from '../../../src/canonical/entityId';

const baseInput = {
  commitSha: 'abc123def456',
  parsed: { package: 'web-app', category: 'regression' as const, subject_summary: '同一バグ再発' },
  committedAt: '2026-01-01T00:00:00.000Z',
  affectedFilePaths: ['src/foo.ts', 'src/bar.ts'],
  introducedCommitSha: 'intro999',
  recordedAt: '2026-01-02T00:00:00.000Z',
};

describe('buildBugEntity', () => {
  test('regression category → severity=error', () => {
    const row = buildBugEntity(baseInput);
    const attrs = JSON.parse(row.attributes_json);
    expect(attrs.severity).toBe('error');
  });

  test('typo category → severity=info', () => {
    const row = buildBugEntity({ ...baseInput, parsed: { ...baseInput.parsed, category: 'typo' } });
    const attrs = JSON.parse(row.attributes_json);
    expect(attrs.severity).toBe('info');
  });

  test('spec category → severity=warn', () => {
    const row = buildBugEntity({ ...baseInput, parsed: { ...baseInput.parsed, category: 'spec' } });
    const attrs = JSON.parse(row.attributes_json);
    expect(attrs.severity).toBe('warn');
  });

  test('logic category → severity=warn', () => {
    const row = buildBugEntity({
      ...baseInput,
      parsed: { ...baseInput.parsed, category: 'logic' },
    });
    const attrs = JSON.parse(row.attributes_json);
    expect(attrs.severity).toBe('warn');
  });

  test('unknown category → severity=info', () => {
    const row = buildBugEntity({
      ...baseInput,
      parsed: { ...baseInput.parsed, category: 'unknown' },
    });
    const attrs = JSON.parse(row.attributes_json);
    expect(attrs.severity).toBe('info');
  });

  test('introducedCommitSha=null → attributes.introduced_commit=null', () => {
    const row = buildBugEntity({ ...baseInput, introducedCommitSha: null });
    const attrs = JSON.parse(row.attributes_json);
    expect(attrs.introduced_commit).toBeNull();
  });

  test('same input twice → same id (deterministic)', () => {
    const row1 = buildBugEntity(baseInput);
    const row2 = buildBugEntity(baseInput);
    expect(row1.id).toBe(row2.id);
    expect(row1.id).toBe(entityId('Bug', baseInput.commitSha));
  });

  test('canonical_name = commitSha', () => {
    const row = buildBugEntity(baseInput);
    expect(row.canonical_name).toBe(baseInput.commitSha);
  });

  test('display_name = subject_summary', () => {
    const row = buildBugEntity(baseInput);
    expect(row.display_name).toBe(baseInput.parsed.subject_summary);
  });

  test('type is Bug', () => {
    const row = buildBugEntity(baseInput);
    expect(row.type).toBe('Bug');
  });

  test('embedding is null', () => {
    const row = buildBugEntity(baseInput);
    expect(row.embedding).toBeNull();
  });
});
