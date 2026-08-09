import { handleGetBugHistory } from '../../tools/getBugHistory';

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
  getBugHistory: jest.fn().mockReturnValue([
    {
      bug_fix_id: 'bf-1',
      commit_sha: 'sha1',
      package: 'web-app',
      category: 'logic',
      subject: 'fix null pointer',
      committed_at: '2026-04-01T00:00:00.000Z',
      affected_file_paths: ['src/foo.ts'],
      introduced_commit_sha: 'sha0',
      caused_by: [{ entity_id: 'ent-1', display_name: 'FooModule', confidence_label: 'HIGH' }],
    },
  ]),
}));

describe('handleGetBugHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('calls getBugHistory with correct input', async () => {
    const { getBugHistory: mockFn } = jest.requireMock('@anytime-markdown/trail-caravan-book/query');

    const result = await handleGetBugHistory({ package: 'web-app', limit: 5 });

    expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({
      package: 'web-app',
      limit: 5,
    }));
    expect(result).toHaveLength(1);
    expect(result[0].bug_fix_id).toBe('bf-1');
  });

  test('passes file_path and category filters', async () => {
    const { getBugHistory: mockFn } = jest.requireMock('@anytime-markdown/trail-caravan-book/query');

    await handleGetBugHistory({ file_path: 'src/foo.ts', category: 'logic' });

    expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({
      file_path: 'src/foo.ts',
      category: 'logic',
    }));
  });

  test('closes db handle after call', async () => {
    const { openCaravanBookDb } = jest.requireMock('@anytime-markdown/trail-caravan-book/query');

    await handleGetBugHistory({});

    const handle = await openCaravanBookDb.mock.results[0].value;
    expect(handle.close).toHaveBeenCalledTimes(1);
  });
});
