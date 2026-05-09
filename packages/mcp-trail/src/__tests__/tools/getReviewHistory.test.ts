import { handleGetReviewHistory } from '../../tools/getReviewHistory';

jest.mock('@anytime-markdown/memory-core', () => ({
  openMemoryCoreDb: jest.fn().mockResolvedValue({
    db: {},
    close: jest.fn(),
  }),
  getReviewHistory: jest.fn().mockReturnValue([
    {
      review_id: 'rv-1',
      source_kind: 'review_doc',
      source_ref: 'review/2026-04.md',
      target_kind: 'code',
      title: 'April review',
      reviewer: 'alice',
      severity_overall: 'warn',
      reviewed_at: '2026-04-01T00:00:00.000Z',
      findings: [
        {
          finding_id: 'rf-1',
          finding_index: 0,
          category: 'logic',
          severity: 'warn',
          finding_text: 'null check missing',
          suggestion_text: '',
          target_file_path: 'src/foo.ts',
          target_symbol: null,
          addressed_commit_sha: null,
          addressed_at: null,
          recorded_at: '2026-04-01T00:00:00.000Z',
          precedes_bug_entity_ids: [],
        },
      ],
    },
  ]),
}));

describe('handleGetReviewHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['MEMORY_CORE_DB_PATH'];
  });

  test('calls getReviewHistory with correct filters', async () => {
    const { getReviewHistory: mockFn } = jest.requireMock('@anytime-markdown/memory-core');

    const result = await handleGetReviewHistory({ target_file_path: 'src/foo.ts' });

    expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({
      target_file_path: 'src/foo.ts',
    }));
    expect(result).toHaveLength(1);
    expect(result[0].review_id).toBe('rv-1');
    expect(result[0].findings).toHaveLength(1);
  });

  test('passes include_precedes_bugs flag', async () => {
    const { getReviewHistory: mockFn } = jest.requireMock('@anytime-markdown/memory-core');

    await handleGetReviewHistory({ include_precedes_bugs: true });

    expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({
      include_precedes_bugs: true,
    }));
  });

  test('closes db handle after call', async () => {
    const { openMemoryCoreDb } = jest.requireMock('@anytime-markdown/memory-core');

    await handleGetReviewHistory({});

    const handle = await openMemoryCoreDb.mock.results[0].value;
    expect(handle.close).toHaveBeenCalledTimes(1);
  });
});
