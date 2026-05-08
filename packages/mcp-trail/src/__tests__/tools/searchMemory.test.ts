import { handleSearchMemory } from '../../tools/searchMemory';

jest.mock('@anytime-markdown/memory-core', () => ({
  openMemoryCoreDb: jest.fn().mockResolvedValue({
    db: {},
    save: jest.fn(),
    close: jest.fn(),
  }),
  attachTrailDbReadOnly: jest.fn().mockResolvedValue({
    trailHandle: { close: jest.fn() },
  }),
  createOllamaClient: jest.fn().mockReturnValue({}),
  searchMemory: jest.fn().mockResolvedValue({
    entities: [{ id: 'e1', type: 'Tool', display_name: 'Jest', summary: 'A test runner', score: 0.9 }],
    edges: [],
    episodes: [],
  }),
}));

describe('handleSearchMemory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['MEMORY_CORE_DB_PATH'];
    delete process.env['TRAIL_DB_PATH'];
    delete process.env['OLLAMA_BASE_URL'];
  });

  test('calls searchMemory with correct input and returns result', async () => {
    const { searchMemory: mockSearchMemory, openMemoryCoreDb } =
      jest.requireMock('@anytime-markdown/memory-core');

    const result = await handleSearchMemory({ query: 'test runner' });

    expect(openMemoryCoreDb).toHaveBeenCalledTimes(1);
    expect(mockSearchMemory).toHaveBeenCalledWith(
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
    const { searchMemory: mockSearchMemory } =
      jest.requireMock('@anytime-markdown/memory-core');

    await handleSearchMemory({
      query: 'dependency',
      entity_types: ['Package'],
      limit: 5,
      hops: 0,
    });

    expect(mockSearchMemory).toHaveBeenCalledWith(
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

  test('attaches trail DB when TRAIL_DB_PATH is set', async () => {
    process.env['TRAIL_DB_PATH'] = '/tmp/trail.db';
    const { attachTrailDbReadOnly } = jest.requireMock('@anytime-markdown/memory-core');

    await handleSearchMemory({ query: 'test' });

    expect(attachTrailDbReadOnly).toHaveBeenCalledTimes(1);
    expect(attachTrailDbReadOnly).toHaveBeenCalledWith(
      expect.anything(),
      '/tmp/trail.db'
    );
  });
});
