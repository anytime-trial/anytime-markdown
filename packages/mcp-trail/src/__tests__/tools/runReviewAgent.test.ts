import { handleRunReviewAgent } from '../../tools/runReviewAgent';

jest.mock('@anytime-markdown/memory-core', () => ({
  openMemoryCoreDb: jest.fn().mockResolvedValue({
    db: {},
    close: jest.fn(),
  }),
  runReviewAgent: jest.fn().mockReturnValue({ run_id: 'test-run-id-123' }),
}));

describe('handleRunReviewAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['MEMORY_CORE_DB_PATH'];
  });

  test('registers run and returns run_id immediately (E8)', async () => {
    const { runReviewAgent: mockFn } = jest.requireMock('@anytime-markdown/memory-core');

    const result = await handleRunReviewAgent({
      trigger_kind: 'mcp',
      target_kind: 'code',
      target_refs: ['packages/web-app/src/foo.ts'],
      prompt_kind: 'security',
    });

    expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({
      trigger_kind: 'mcp',
      target_kind: 'code',
      target_refs: ['packages/web-app/src/foo.ts'],
      prompt_kind: 'security',
    }));
    expect(result.run_id).toBe('test-run-id-123');
  });

  test('passes optional model override', async () => {
    const { runReviewAgent: mockFn } = jest.requireMock('@anytime-markdown/memory-core');

    await handleRunReviewAgent({
      trigger_kind: 'mcp',
      target_kind: 'spec',
      target_refs: ['spec/feature.md'],
      prompt_kind: 'spec_drift',
      model: 'claude-opus-4-7',
    });

    expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-opus-4-7' }));
  });

  test('closes db handle after call', async () => {
    const { openMemoryCoreDb } = jest.requireMock('@anytime-markdown/memory-core');

    await handleRunReviewAgent({
      trigger_kind: 'mcp',
      target_kind: 'code',
      target_refs: [],
      prompt_kind: 'logic',
    });

    const handle = await openMemoryCoreDb.mock.results[0].value;
    expect(handle.close).toHaveBeenCalledTimes(1);
  });
});
