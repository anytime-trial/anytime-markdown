import { handleListReviewTargetHints } from '../../tools/listReviewTargetHints';

jest.mock('@anytime-markdown/memory-core', () => ({
  openMemoryCoreDb: jest.fn().mockResolvedValue({
    db: {},
    close: jest.fn(),
  }),
  listReviewTargetHints: jest.fn().mockReturnValue([
    { target_ref: 'src/hotspot.ts', priority: 'high', reason: 'unresolved review finding drift' },
    { target_ref: 'src/recent.ts', priority: 'medium', reason: 'code changed in last 7 days' },
    { target_ref: 'src/old.ts', priority: 'low', reason: 'no review in last 90 days' },
  ]),
}));

describe('handleListReviewTargetHints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['MEMORY_CORE_DB_PATH'];
  });

  test('returns hints in priority order', async () => {
    const result = await handleListReviewTargetHints({});

    expect(result).toHaveLength(3);
    expect(result[0].priority).toBe('high');
    expect(result[1].priority).toBe('medium');
    expect(result[2].priority).toBe('low');
  });

  test('passes limit through', async () => {
    const { listReviewTargetHints: mockFn } = jest.requireMock('@anytime-markdown/memory-core');

    await handleListReviewTargetHints({ limit: 5 });

    expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({ limit: 5 }));
  });

  test('closes db handle after call', async () => {
    const { openMemoryCoreDb } = jest.requireMock('@anytime-markdown/memory-core');

    await handleListReviewTargetHints({});

    const handle = await openMemoryCoreDb.mock.results[0].value;
    expect(handle.close).toHaveBeenCalledTimes(1);
  });
});
