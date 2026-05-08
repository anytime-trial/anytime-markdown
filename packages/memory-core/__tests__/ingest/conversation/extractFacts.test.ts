import { extractFactsFromEpisode } from '../../../src/ingest/conversation/extractFacts';
import type { MemoryLogger } from '../../../src/logger';

const mockLogger: MemoryLogger = {
  info: jest.fn(),
  error: jest.fn(),
};

const episodeBase = {
  session_id: 'sess1',
  message_uuid_start: 'uuid1',
  message_uuid_end: 'uuid2',
  valid_from: '2026-01-01T00:00:00.000Z',
  raw_excerpt: 'user: I prefer React\n---\nassistant: OK',
};

function makeOllama(responseJson: object) {
  return {
    generate: jest.fn().mockResolvedValue({ response: JSON.stringify(responseJson) }),
    embeddings: jest.fn(),
  };
}

describe('extractFactsFromEpisode', () => {
  afterEach(() => jest.clearAllMocks());

  test('returns parsed extraction on success', async () => {
    const ollama = makeOllama({
      summary: 'User prefers React',
      entities: [{ type: 'Library', name: 'react', aliases: [], tags: [], attributes: {} }],
      relations: [
        {
          subject: { type: 'Person', name: 'ueda' },
          predicate: 'prefers',
          object: { type: 'Library', name: 'react' },
          valid_from: null,
          confidence: 0.9,
        },
      ],
    });
    const result = await extractFactsFromEpisode({ ollama, episode: episodeBase, logger: mockLogger });
    expect(result).not.toBeNull();
    expect(result!.summary).toBe('User prefers React');
    expect(result!.entities).toHaveLength(1);
    expect(result!.relations).toHaveLength(1);
  });

  test('extracts questions when episode has question marks', async () => {
    const episodeWithQ = {
      ...episodeBase,
      raw_excerpt: 'user: Reactはどのバージョンでしょうか？\n---\nassistant: v18です',
    };
    const ollama = makeOllama({
      summary: 'Question about React version',
      entities: [],
      relations: [],
      questions: [
        {
          text: 'Reactはどのバージョンでしょうか？',
          target_spec_path: null,
          target_symbol: null,
          asked_by: 'ueda',
          answered_in: true,
        },
      ],
    });
    const result = await extractFactsFromEpisode({ ollama, episode: episodeWithQ, logger: mockLogger });
    expect(result).not.toBeNull();
    expect(result!.questions).toHaveLength(1);
    expect(result!.questions![0].text).toContain('React');
  });

  test('uses buildConversationPrompt when question mark present', async () => {
    const episodeWithQ = {
      ...episodeBase,
      raw_excerpt: 'user: どう動きますか？\n---\nassistant: このように動きます',
    };
    const ollama = makeOllama({ summary: 'test', entities: [], relations: [] });
    await extractFactsFromEpisode({ ollama, episode: episodeWithQ, logger: mockLogger });
    const promptUsed: string = (ollama.generate as jest.Mock).mock.calls[0][0].prompt;
    // Question extraction instructions should be present
    expect(promptUsed).toContain('Question entity を抽出してください');
  });

  test('uses buildConversationPromptNoQuestion when no question mark', async () => {
    const ollama = makeOllama({ summary: 'test', entities: [], relations: [] });
    await extractFactsFromEpisode({ ollama, episode: episodeBase, logger: mockLogger });
    const promptUsed: string = (ollama.generate as jest.Mock).mock.calls[0][0].prompt;
    // No-question version should contain the skip instruction
    expect(promptUsed).toContain('Question entity は抽出しません');
  });

  test('returns null and logs on invalid enum type', async () => {
    const ollama = makeOllama({
      summary: 'test',
      entities: [{ type: 'InvalidType', name: 'foo', aliases: [], tags: [], attributes: {} }],
      relations: [],
    });
    const result = await extractFactsFromEpisode({ ollama, episode: episodeBase, logger: mockLogger });
    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalled();
  });

  test('returns null and logs on JSON.parse failure', async () => {
    const ollama = {
      generate: jest.fn().mockResolvedValue({ response: 'not json' }),
      embeddings: jest.fn(),
    };
    const result = await extractFactsFromEpisode({ ollama, episode: episodeBase, logger: mockLogger });
    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalled();
  });

  test('returns null and logs on Ollama failure', async () => {
    const ollama = {
      generate: jest.fn().mockRejectedValue(new Error('ollama_unreachable')),
      embeddings: jest.fn(),
    };
    const result = await extractFactsFromEpisode({ ollama, episode: episodeBase, logger: mockLogger });
    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalled();
  });

  test('empty questions array when no question mark in episode', async () => {
    const ollama = makeOllama({
      summary: 'No questions here',
      entities: [],
      relations: [],
      questions: [],
    });
    const result = await extractFactsFromEpisode({ ollama, episode: episodeBase, logger: mockLogger });
    expect(result).not.toBeNull();
    expect(result!.questions).toHaveLength(0);
  });

  test('defaults are applied for missing optional fields', async () => {
    const ollama = makeOllama({
      summary: 'Minimal response',
      // entities/relations/questions omitted - should default to []
    });
    const result = await extractFactsFromEpisode({ ollama, episode: episodeBase, logger: mockLogger });
    expect(result).not.toBeNull();
    expect(result!.entities).toEqual([]);
    expect(result!.relations).toEqual([]);
    expect(result!.questions).toEqual([]);
  });

  test('passes model option to ollama.generate', async () => {
    const ollama = makeOllama({ summary: 'test', entities: [], relations: [] });
    await extractFactsFromEpisode({
      ollama,
      episode: episodeBase,
      model: 'llama3:8b',
      logger: mockLogger,
    });
    expect((ollama.generate as jest.Mock).mock.calls[0][0].model).toBe('llama3:8b');
  });

  test('passes format json to ollama.generate', async () => {
    const ollama = makeOllama({ summary: 'test', entities: [], relations: [] });
    await extractFactsFromEpisode({ ollama, episode: episodeBase, logger: mockLogger });
    expect((ollama.generate as jest.Mock).mock.calls[0][0].format).toBe('json');
  });

  test('handles ASCII question mark', async () => {
    const episodeAsciiQ = {
      ...episodeBase,
      raw_excerpt: 'user: Is React v18 available?\n---\nassistant: Yes',
    };
    const ollama = makeOllama({ summary: 'test', entities: [], relations: [] });
    await extractFactsFromEpisode({ ollama, episode: episodeAsciiQ, logger: mockLogger });
    const promptUsed: string = (ollama.generate as jest.Mock).mock.calls[0][0].prompt;
    expect(promptUsed).toContain('Question entity を抽出してください');
  });
});
