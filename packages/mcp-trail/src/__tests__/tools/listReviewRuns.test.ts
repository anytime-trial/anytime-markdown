import { handleListReviewRuns } from '../../tools/listReviewRuns';

jest.mock('@anytime-markdown/memory-core', () => ({
  openMemoryCoreDb: jest.fn().mockResolvedValue({
    db: {},
    close: jest.fn(),
  }),
  listReviewRuns: jest.fn().mockReturnValue([
    {
      run_id: 'run-1',
      trigger_kind: 'mcp',
      target_kind: 'code',
      target_refs: ['src/foo.ts'],
      model: 'claude-sonnet-4-6',
      prompt_kind: 'security',
      started_at: '2026-05-01T00:00:00.000Z',
      finished_at: '2026-05-01T00:01:00.000Z',
      duration_ms: 60000,
      status: 'success',
      findings_count: 2,
      findings_inserted: 2,
      findings_merged: 0,
      input_tokens: 1000,
      output_tokens: 500,
      review_id: 'rv-1',
      error_detail: '',
    },
  ]),
}));

describe('handleListReviewRuns', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['MEMORY_CORE_DB_PATH'];
  });

  test('filters by status (E8)', async () => {
    const { listReviewRuns: mockFn } = jest.requireMock('@anytime-markdown/memory-core');

    const result = await handleListReviewRuns({ status: 'success' });

    expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('success');
  });

  test('passes all filters through', async () => {
    const { listReviewRuns: mockFn } = jest.requireMock('@anytime-markdown/memory-core');

    await handleListReviewRuns({
      trigger_kind: 'mcp',
      target_kind: 'code',
      model: 'claude-sonnet-4-6',
      since: '2026-05-01T00:00:00.000Z',
      limit: 10,
    });

    expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({
      trigger_kind: 'mcp',
      target_kind: 'code',
      model: 'claude-sonnet-4-6',
      since: '2026-05-01T00:00:00.000Z',
      limit: 10,
    }));
  });

  test('closes db handle after call', async () => {
    const { openMemoryCoreDb } = jest.requireMock('@anytime-markdown/memory-core');

    await handleListReviewRuns({});

    const handle = await openMemoryCoreDb.mock.results[0].value;
    expect(handle.close).toHaveBeenCalledTimes(1);
  });
});
