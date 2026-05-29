import { handleSearchMemory } from '../../tools/searchMemory';

const mockClose = jest.fn();
const mockSearchMemoryFn = jest.fn();
const mockOpenMemoryCoreDb = jest.fn();
const mockCreateOllamaClient = jest.fn().mockReturnValue({});

jest.mock('@anytime-markdown/memory-core/query', () => ({
  noopLogger: { info: () => {}, error: () => {}, warn: () => {} },
  openMemoryCoreDb: (...args: unknown[]) => mockOpenMemoryCoreDb(...args),
  searchMemory: (...args: unknown[]) => mockSearchMemoryFn(...args),
}));

jest.mock('@anytime-markdown/agent-core', () => ({
  createOllamaClient: (...args: unknown[]) => mockCreateOllamaClient(...args),
}));

describe('handleSearchMemory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['OLLAMA_BASE_URL'];

    mockOpenMemoryCoreDb.mockResolvedValue({
      db: {},
      save: jest.fn(),
      close: mockClose,
    });

    mockSearchMemoryFn.mockResolvedValue({
      entities: [{ id: 'e1', type: 'Tool', display_name: 'Jest', summary: 'A test runner', score: 0.9 }],
      edges: [],
      episodes: [],
    });
  });

  test('calls searchMemory with correct input and returns result', async () => {
    const result = await handleSearchMemory({ query: 'test runner' });

    expect(mockOpenMemoryCoreDb).toHaveBeenCalledTimes(1);
    expect(mockSearchMemoryFn).toHaveBeenCalledWith(
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
    await handleSearchMemory({
      query: 'dependency',
      entity_types: ['Package'],
      limit: 5,
      hops: 0,
    });

    expect(mockSearchMemoryFn).toHaveBeenCalledWith(
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

    await handleSearchMemory({ query: 'test' });

    expect(mockCreateOllamaClient).toHaveBeenCalledWith({ baseUrl: 'http://custom-ollama:11434' });
  });

  test('OLLAMA_BASE_URL が未設定の場合は空オブジェクトで createOllamaClient を呼ぶ', async () => {
    await handleSearchMemory({ query: 'test' });

    expect(mockCreateOllamaClient).toHaveBeenCalledWith({});
  });

  test('close() は searchMemory 成功時に必ず呼ばれる', async () => {
    await handleSearchMemory({ query: 'test' });

    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  test('searchMemory が throw しても close() が呼ばれる', async () => {
    mockSearchMemoryFn.mockRejectedValue(new Error('search failed'));

    await expect(handleSearchMemory({ query: 'error-case' })).rejects.toThrow('search failed');

    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
