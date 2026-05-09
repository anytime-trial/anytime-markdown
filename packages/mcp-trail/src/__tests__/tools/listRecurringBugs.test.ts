import { handleListRecurringBugs } from '../../tools/listRecurringBugs';

jest.mock('@anytime-markdown/memory-core', () => ({
  openMemoryCoreDb: jest.fn().mockResolvedValue({
    db: {},
    close: jest.fn(),
  }),
  listRecurringBugs: jest.fn().mockReturnValue([
    {
      grouping: 'file_path',
      grouping_value: 'src/foo.ts',
      bug_count: 2,
      bugs: [
        { bug_fix_id: 'bf-1', commit_sha: 'sha1', subject: 'fix regression', committed_at: '2026-04-01T00:00:00.000Z' },
        { bug_fix_id: 'bf-2', commit_sha: 'sha2', subject: 'fix regression again', committed_at: '2026-04-10T00:00:00.000Z' },
      ],
    },
  ]),
}));

describe('handleListRecurringBugs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['MEMORY_CORE_DB_PATH'];
  });

  test('calls listRecurringBugs with correct input', async () => {
    const { listRecurringBugs: mockFn } = jest.requireMock('@anytime-markdown/memory-core');

    const result = await handleListRecurringBugs({ file_path: 'src/foo.ts', windowDays: 90, minCount: 2 });

    expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({
      file_path: 'src/foo.ts',
      windowDays: 90,
      minCount: 2,
    }));
    expect(result).toHaveLength(1);
    expect(result[0].grouping).toBe('file_path');
  });

  test('passes package filter through', async () => {
    const { listRecurringBugs: mockFn } = jest.requireMock('@anytime-markdown/memory-core');

    await handleListRecurringBugs({ package: 'web-app' });

    expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({ package: 'web-app' }));
  });

  test('closes db handle after call', async () => {
    const { openMemoryCoreDb } = jest.requireMock('@anytime-markdown/memory-core');

    await handleListRecurringBugs({});

    const handle = await openMemoryCoreDb.mock.results[0].value;
    expect(handle.close).toHaveBeenCalledTimes(1);
  });
});
