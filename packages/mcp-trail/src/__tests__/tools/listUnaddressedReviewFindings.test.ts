import { handleListUnaddressedReviewFindings } from '../../tools/listUnaddressedReviewFindings';

jest.mock('@anytime-markdown/memory-core', () => ({
  openMemoryCoreDb: jest.fn().mockResolvedValue({
    db: {},
    close: jest.fn(),
  }),
  listUnaddressedReviewFindings: jest.fn().mockReturnValue([
    {
      finding_id: 'rf-1',
      review_id: 'rv-1',
      category: 'logic',
      severity: 'warn',
      finding_text: 'null check missing',
      suggestion_text: 'add guard',
      target_file_path: 'src/foo.ts',
      target_symbol: null,
      recorded_at: '2026-03-01T00:00:00.000Z',
    },
  ]),
}));

describe('handleListUnaddressedReviewFindings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['MEMORY_CORE_DB_PATH'];
  });

  test('calls listUnaddressedReviewFindings with correct filters (I21)', async () => {
    const { listUnaddressedReviewFindings: mockFn } = jest.requireMock('@anytime-markdown/memory-core');

    const result = await handleListUnaddressedReviewFindings({ severity: 'warn', daysSinceMin: 30 });

    expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({
      severity: 'warn',
      daysSinceMin: 30,
    }));
    expect(result).toHaveLength(1);
    expect(result[0].finding_id).toBe('rf-1');
  });

  test('passes file_path and category filters', async () => {
    const { listUnaddressedReviewFindings: mockFn } = jest.requireMock('@anytime-markdown/memory-core');

    await handleListUnaddressedReviewFindings({ target_file_path: 'src/foo.ts', category: 'logic' });

    expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({
      target_file_path: 'src/foo.ts',
      category: 'logic',
    }));
  });

  test('closes db handle after call', async () => {
    const { openMemoryCoreDb } = jest.requireMock('@anytime-markdown/memory-core');

    await handleListUnaddressedReviewFindings({});

    const handle = await openMemoryCoreDb.mock.results[0].value;
    expect(handle.close).toHaveBeenCalledTimes(1);
  });
});
