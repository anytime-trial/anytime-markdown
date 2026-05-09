import { handleResolveDrift } from '../../tools/resolveDrift';

jest.mock('@anytime-markdown/memory-core', () => ({
  openMemoryCoreDb: jest.fn().mockResolvedValue({
    db: {},
    close: jest.fn(),
  }),
  resolveDrift: jest.fn().mockReturnValue({ resolved: true }),
}));

describe('handleResolveDrift', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['MEMORY_CORE_DB_PATH'];
  });

  test('calls resolveDrift and returns resolved=true', async () => {
    const { resolveDrift: mockFn } = jest.requireMock('@anytime-markdown/memory-core');

    const result = await handleResolveDrift({ event_id: 'ev-1', resolution_note: 'fixed in PR #42' });

    expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({
      event_id: 'ev-1',
      resolution_note: 'fixed in PR #42',
    }));
    expect(result.resolved).toBe(true);
  });

  test('returns resolved=false when event not found', async () => {
    const { resolveDrift: mockFn } = jest.requireMock('@anytime-markdown/memory-core');
    mockFn.mockReturnValueOnce({ resolved: false });

    const result = await handleResolveDrift({ event_id: 'nonexistent', resolution_note: 'n/a' });

    expect(result.resolved).toBe(false);
  });

  test('passes optional resolved_at through', async () => {
    const { resolveDrift: mockFn } = jest.requireMock('@anytime-markdown/memory-core');

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
    const { openMemoryCoreDb } = jest.requireMock('@anytime-markdown/memory-core');

    await handleResolveDrift({ event_id: 'ev-1', resolution_note: 'done' });

    const handle = await openMemoryCoreDb.mock.results[0].value;
    expect(handle.close).toHaveBeenCalledTimes(1);
  });
});
