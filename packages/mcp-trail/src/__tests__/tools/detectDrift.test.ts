import { handleDetectDrift } from '../../tools/detectDrift';

jest.mock('@anytime-markdown/memory-core', () => ({
  openMemoryCoreDb: jest.fn().mockResolvedValue({
    db: {},
    close: jest.fn(),
  }),
  detectDrift: jest.fn().mockReturnValue([
    {
      event_id: 'ev-1',
      subject_entity_id: 'ent-1',
      predicate: 'implements',
      drift_type: 'spec_vs_code',
      severity: 'warn',
      detected_at: '2026-05-01T00:00:00.000Z',
      resolved_at: null,
      resolution_note: '',
      detail: { note: 'test' },
    },
    {
      event_id: 'ev-2',
      subject_entity_id: 'ent-2',
      predicate: 'implements',
      drift_type: 'regression_cluster',
      severity: 'error',
      detected_at: '2026-05-02T00:00:00.000Z',
      resolved_at: null,
      resolution_note: '',
      detail: {},
    },
  ]),
}));

describe('handleDetectDrift', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['MEMORY_CORE_DB_PATH'];
  });

  test('calls detectDrift with unresolved_only=true by default', async () => {
    const { detectDrift: mockFn } = jest.requireMock('@anytime-markdown/memory-core');

    const result = await handleDetectDrift({});

    expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({}));
    expect(result).toHaveLength(2);
  });

  test('filters by severity', async () => {
    const { detectDrift: mockFn } = jest.requireMock('@anytime-markdown/memory-core');

    await handleDetectDrift({ severity: 'error' });

    expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
  });

  test('filters by drift_type and subject_id', async () => {
    const { detectDrift: mockFn } = jest.requireMock('@anytime-markdown/memory-core');

    await handleDetectDrift({ drift_type: 'spec_vs_code', subject_id: 'ent-1' });

    expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({
      drift_type: 'spec_vs_code',
      subject_id: 'ent-1',
    }));
  });

  test('closes db handle after call', async () => {
    const { openMemoryCoreDb } = jest.requireMock('@anytime-markdown/memory-core');

    await handleDetectDrift({});

    const handle = await openMemoryCoreDb.mock.results[0].value;
    expect(handle.close).toHaveBeenCalledTimes(1);
  });
});
