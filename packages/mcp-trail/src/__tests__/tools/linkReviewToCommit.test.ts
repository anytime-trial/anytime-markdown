import { handleLinkReviewToCommit } from '../../tools/linkReviewToCommit';

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
  linkReviewToCommit: jest.fn().mockReturnValue({ linked: true }),
}));

describe('handleLinkReviewToCommit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('calls linkReviewToCommit with correct input (E5)', async () => {
    const { linkReviewToCommit: mockFn } = jest.requireMock('@anytime-markdown/trail-caravan-book/query');

    const result = await handleLinkReviewToCommit({ finding_id: 'rf-1', commit_sha: 'abc123' });

    expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({
      finding_id: 'rf-1',
      commit_sha: 'abc123',
    }));
    expect(result.linked).toBe(true);
  });

  test('returns linked=false when called again without override (E5)', async () => {
    const { linkReviewToCommit: mockFn } = jest.requireMock('@anytime-markdown/trail-caravan-book/query');
    mockFn.mockReturnValueOnce({ linked: false, previous_commit: 'abc123' });

    const result = await handleLinkReviewToCommit({
      finding_id: 'rf-1',
      commit_sha: 'def456',
      override_auto: false,
    });

    expect(result.linked).toBe(false);
    expect(result.previous_commit).toBe('abc123');
  });

  test('passes override_auto=true through', async () => {
    const { linkReviewToCommit: mockFn } = jest.requireMock('@anytime-markdown/trail-caravan-book/query');

    await handleLinkReviewToCommit({ finding_id: 'rf-1', commit_sha: 'abc123', override_auto: true });

    expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({ override_auto: true }));
  });

  test('closes db handle after call', async () => {
    const { openCaravanBookDb } = jest.requireMock('@anytime-markdown/trail-caravan-book/query');

    await handleLinkReviewToCommit({ finding_id: 'rf-1', commit_sha: 'abc123' });

    const handle = await openCaravanBookDb.mock.results[0].value;
    expect(handle.close).toHaveBeenCalledTimes(1);
  });
});
