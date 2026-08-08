import { handleRunReviewAgent } from '../../tools/runReviewAgent';

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
  runReviewAgent: jest.fn().mockReturnValue({ run_id: 'test-run-id-123' }),
}));

describe('handleRunReviewAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('registers run and returns run_id immediately (E8)', async () => {
    const { runReviewAgent: mockFn, openCaravanBookDb: mockOpen } = jest.requireMock(
      '@anytime-markdown/trail-caravan-book/query',
    );

    const result = await handleRunReviewAgent({
      trigger_kind: 'mcp',
      target_kind: 'code',
      target_refs: ['packages/web-app/src/foo.ts'],
      prompt_kind: 'security',
    });

    // 解決したパスが open へ渡っているか（書き込み系ツールでの配線切れの検知）
    expect(mockOpen).toHaveBeenCalledWith('/tmp/mcp-trail-test/caravan-book.db');
    expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({
      trigger_kind: 'mcp',
      target_kind: 'code',
      target_refs: ['packages/web-app/src/foo.ts'],
      prompt_kind: 'security',
    }));
    expect(result.run_id).toBe('test-run-id-123');
  });

  test('passes optional model override', async () => {
    const { runReviewAgent: mockFn } = jest.requireMock('@anytime-markdown/trail-caravan-book/query');

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
    const { openCaravanBookDb } = jest.requireMock('@anytime-markdown/trail-caravan-book/query');

    await handleRunReviewAgent({
      trigger_kind: 'mcp',
      target_kind: 'code',
      target_refs: [],
      prompt_kind: 'logic',
    });

    const handle = await openCaravanBookDb.mock.results[0].value;
    expect(handle.close).toHaveBeenCalledTimes(1);
  });
});
