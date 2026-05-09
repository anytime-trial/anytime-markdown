import { handleGetReviewRunStatus } from '../../tools/getReviewRunStatus';

jest.mock('@anytime-markdown/memory-core', () => ({
  openMemoryCoreDb: jest.fn().mockResolvedValue({
    db: {},
    close: jest.fn(),
  }),
  getReviewRunStatus: jest.fn().mockReturnValue({
    run_id: 'test-run-id-123',
    trigger_kind: 'mcp',
    target_kind: 'code',
    target_refs: ['packages/web-app/src/foo.ts'],
    model: 'claude-sonnet-4-6',
    prompt_kind: 'security',
    started_at: '2026-05-01T00:00:00.000Z',
    finished_at: null,
    duration_ms: 0,
    status: 'running',
    findings_count: 0,
    findings_inserted: 0,
    findings_merged: 0,
    input_tokens: 0,
    output_tokens: 0,
    review_id: null,
    error_detail: '',
  }),
}));

describe('handleGetReviewRunStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['MEMORY_CORE_DB_PATH'];
  });

  test('returns run status (E8)', async () => {
    const { getReviewRunStatus: mockFn } = jest.requireMock('@anytime-markdown/memory-core');

    const result = await handleGetReviewRunStatus({ run_id: 'test-run-id-123' });

    expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({ run_id: 'test-run-id-123' }));
    expect(result?.status).toBe('running');
    expect(result?.run_id).toBe('test-run-id-123');
  });

  test('returns null for unknown run_id', async () => {
    const { getReviewRunStatus: mockFn } = jest.requireMock('@anytime-markdown/memory-core');
    mockFn.mockReturnValueOnce(null);

    const result = await handleGetReviewRunStatus({ run_id: 'unknown' });

    expect(result).toBeNull();
  });

  test('closes db handle after call', async () => {
    const { openMemoryCoreDb } = jest.requireMock('@anytime-markdown/memory-core');

    await handleGetReviewRunStatus({ run_id: 'test-run-id-123' });

    const handle = await openMemoryCoreDb.mock.results[0].value;
    expect(handle.close).toHaveBeenCalledTimes(1);
  });
});
