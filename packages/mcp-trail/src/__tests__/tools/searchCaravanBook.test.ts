import { handleSearchCaravanBook } from '../../tools/searchCaravanBook';

const mockClose = jest.fn();
const mockSearchCaravanBookFn = jest.fn();
const mockOpenCaravanBookDb = jest.fn();
const mockCreateOllamaClient = jest.fn().mockReturnValue({});

// resolveCaravanDbPath は実ファイルの存在を検査する（不在なら throw）。ここでは
// openCaravanBookDb をモックしているため、パス解決も併せてモックする。
jest.mock('../../dbPath', () => ({
  ...jest.requireActual('../../dbPath'),
  resolveCaravanDbPath: () => '/tmp/mcp-trail-test/caravan-book.db',
}));

jest.mock('@anytime-markdown/trail-caravan-book/query', () => ({
  noopLogger: { info: () => {}, error: () => {}, warn: () => {} },
  openCaravanBookDb: (...args: unknown[]) => mockOpenCaravanBookDb(...args),
  searchCaravanBook: (...args: unknown[]) => mockSearchCaravanBookFn(...args),
}));

jest.mock('@anytime-markdown/agent-core', () => ({
  createOllamaClient: (...args: unknown[]) => mockCreateOllamaClient(...args),
}));

describe('handleSearchCaravanBook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['OLLAMA_BASE_URL'];

    mockOpenCaravanBookDb.mockResolvedValue({
      db: {},
      save: jest.fn(),
      close: mockClose,
    });

    mockSearchCaravanBookFn.mockResolvedValue({
      entities: [{ id: 'e1', type: 'Tool', display_name: 'Jest', summary: 'A test runner', score: 0.9 }],
      edges: [],
      episodes: [],
    });
  });

  test('calls searchCaravanBook with correct input and returns result', async () => {
    const result = await handleSearchCaravanBook({ query: 'test runner' });

    expect(mockOpenCaravanBookDb).toHaveBeenCalledTimes(1);
    // 解決したパスが open へ渡っているか（配線切れの検知）。件数だけ見ていると、
    // 解決結果を使わない実装へ変わっても気づけない
    expect(mockOpenCaravanBookDb).toHaveBeenCalledWith('/tmp/mcp-trail-test/caravan-book.db');
    expect(mockSearchCaravanBookFn).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { query: 'test runner' },
      })
    );
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].id).toBe('e1');
    expect(result.edges).toHaveLength(0);
    expect(result.episodes).toHaveLength(0);
  });

  test('passes all optional input fields through', async () => {
    await handleSearchCaravanBook({
      query: 'dependency',
      entity_types: ['Package'],
      limit: 5,
      hops: 0,
    });

    expect(mockSearchCaravanBookFn).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          query: 'dependency',
          entity_types: ['Package'],
          limit: 5,
          hops: 0,
        },
      })
    );
  });

  test('OLLAMA_BASE_URL が設定されている場合は baseUrl を渡して createOllamaClient を呼ぶ', async () => {
    process.env['OLLAMA_BASE_URL'] = 'http://custom-ollama:11434';

    await handleSearchCaravanBook({ query: 'test' });

    expect(mockCreateOllamaClient).toHaveBeenCalledWith({ baseUrl: 'http://custom-ollama:11434' });
  });

  test('OLLAMA_BASE_URL が未設定の場合は空オブジェクトで createOllamaClient を呼ぶ', async () => {
    await handleSearchCaravanBook({ query: 'test' });

    expect(mockCreateOllamaClient).toHaveBeenCalledWith({});
  });

  test('close() は searchCaravanBook 成功時に必ず呼ばれる', async () => {
    await handleSearchCaravanBook({ query: 'test' });

    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  test('searchCaravanBook が throw しても close() が呼ばれる', async () => {
    mockSearchCaravanBookFn.mockRejectedValue(new Error('search failed'));

    await expect(handleSearchCaravanBook({ query: 'error-case' })).rejects.toThrow('search failed');

    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
