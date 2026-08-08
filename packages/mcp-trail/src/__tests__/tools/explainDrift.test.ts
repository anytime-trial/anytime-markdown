import { handleExplainDrift } from '../../tools/explainDrift';

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
  explainDrift: jest.fn().mockReturnValue({
    event_id: 'ev-1',
    subject_entity_id: 'ent-1',
    drift_type: 'spec_vs_code',
    severity: 'warn',
    detail: { note: 'mismatch' },
    sources: [
      { source: 'conversation', items: [{ value: 'talked about X' }] },
      { source: 'spec', items: [{ rel_path: 'spec/feature.md', title: 'Feature Spec', summary: 'desc', line_hint: 5, value: 'spec says Y' }] },
      { source: 'code', items: [{ file_path: 'src/feature.ts', fact_type: 'function', fact_value: 'does Z', recorded_at: '2026-05-01T00:00:00.000Z' }] },
    ],
  }),
}));

describe('handleExplainDrift', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 5-source explanation for an event', async () => {
    const { explainDrift: mockFn } = jest.requireMock('@anytime-markdown/trail-caravan-book/query');

    const result = await handleExplainDrift({ event_id: 'ev-1' });

    expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({ event_id: 'ev-1' }));
    expect(result?.event_id).toBe('ev-1');
    expect(result?.sources).toHaveLength(3);
    expect(result?.sources[0].source).toBe('conversation');
  });

  test('returns null for unknown event', async () => {
    const { explainDrift: mockFn } = jest.requireMock('@anytime-markdown/trail-caravan-book/query');
    mockFn.mockReturnValueOnce(null);

    const result = await handleExplainDrift({ event_id: 'nonexistent' });

    expect(result).toBeNull();
  });

  test('closes db handle after call', async () => {
    const { openMemoryCoreDb } = jest.requireMock('@anytime-markdown/trail-caravan-book/query');

    await handleExplainDrift({ event_id: 'ev-1' });

    const handle = await openMemoryCoreDb.mock.results[0].value;
    expect(handle.close).toHaveBeenCalledTimes(1);
  });
});
