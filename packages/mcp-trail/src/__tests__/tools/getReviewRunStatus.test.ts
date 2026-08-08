import { handleGetReviewRunStatus } from '../../tools/getReviewRunStatus';

// resolveCaravanDbPath は実ファイルの存在を検査する（不在なら throw）。ここでは
// openCaravanBookDb をモックしているため、パス解決も併せてモックする。
jest.mock('../../dbPath', () => ({
  ...jest.requireActual('../../dbPath'),
  resolveCaravanDbPath: () => '/tmp/mcp-trail-test/caravan-book.db',
}));

jest.mock('@anytime-markdown/trail-caravan-book/query', () => ({
  noopLogger: { info: () => {}, error: () => {}, warn: () => {} },
  openCaravanBookDb: jest.fn().mockResolvedValue({
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
  });

  test('returns run status (E8)', async () => {
    const { getReviewRunStatus: mockFn } = jest.requireMock('@anytime-markdown/trail-caravan-book/query');

    const result = await handleGetReviewRunStatus({ run_id: 'test-run-id-123' });

    expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({ run_id: 'test-run-id-123' }));
    expect(result?.status).toBe('running');
    expect(result?.run_id).toBe('test-run-id-123');
  });

  test('returns null for unknown run_id', async () => {
    const { getReviewRunStatus: mockFn } = jest.requireMock('@anytime-markdown/trail-caravan-book/query');
    mockFn.mockReturnValueOnce(null);

    const result = await handleGetReviewRunStatus({ run_id: 'unknown' });

    expect(result).toBeNull();
  });

  test('closes db handle after call', async () => {
    const { openCaravanBookDb } = jest.requireMock('@anytime-markdown/trail-caravan-book/query');

    await handleGetReviewRunStatus({ run_id: 'test-run-id-123' });

    const handle = await openCaravanBookDb.mock.results[0].value;
    expect(handle.close).toHaveBeenCalledTimes(1);
  });
});
