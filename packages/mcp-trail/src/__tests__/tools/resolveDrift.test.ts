import { handleResolveDrift } from '../../tools/resolveDrift';

// resolveMemoryDbPath は実ファイルの存在を検査する（不在なら throw）。ここでは
// openMemoryCoreDb をモックしているため、パス解決も併せてモックする。
jest.mock('../../dbPath', () => ({
  ...jest.requireActual('../../dbPath'),
  resolveMemoryDbPath: () => '/tmp/mcp-trail-test/caravan-book.db',
}));

jest.mock('@anytime-markdown/trail-caravan-book/query', () => ({
  noopLogger: { info: () => {}, error: () => {}, warn: () => {} },
  openMemoryCoreDb: jest.fn().mockResolvedValue({
    db: {},
    close: jest.fn(),
  }),
  resolveDrift: jest.fn().mockReturnValue({ resolved: true }),
}));

describe('handleResolveDrift', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('calls resolveDrift and returns resolved=true', async () => {
    const { resolveDrift: mockFn } = jest.requireMock('@anytime-markdown/trail-caravan-book/query');

    const result = await handleResolveDrift({ event_id: 'ev-1', resolution_note: 'fixed in PR #42' });

    expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({
      event_id: 'ev-1',
      resolution_note: 'fixed in PR #42',
    }));
    expect(result.resolved).toBe(true);
  });

  test('returns resolved=false when event not found', async () => {
    const { resolveDrift: mockFn } = jest.requireMock('@anytime-markdown/trail-caravan-book/query');
    mockFn.mockReturnValueOnce({ resolved: false });

    const result = await handleResolveDrift({ event_id: 'nonexistent', resolution_note: 'n/a' });

    expect(result.resolved).toBe(false);
  });

  test('passes optional resolved_at through', async () => {
    const { resolveDrift: mockFn } = jest.requireMock('@anytime-markdown/trail-caravan-book/query');

    await handleResolveDrift({
      event_id: 'ev-1',
      resolution_note: 'done',
      resolved_at: '2026-05-10T12:00:00.000Z',
    });

    expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({
      resolved_at: '2026-05-10T12:00:00.000Z',
    }));
  });

  test('closes db handle after call', async () => {
    const { openMemoryCoreDb } = jest.requireMock('@anytime-markdown/trail-caravan-book/query');

    await handleResolveDrift({ event_id: 'ev-1', resolution_note: 'done' });

    const handle = await openMemoryCoreDb.mock.results[0].value;
    expect(handle.close).toHaveBeenCalledTimes(1);
  });
});
