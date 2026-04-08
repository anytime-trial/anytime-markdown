import type { TrailMessage } from '../types';
import { aggregateUsage } from '../aggregateUsage';

const makeMessage = (
  overrides: Partial<TrailMessage> = {},
): TrailMessage => ({
  uuid: 'uuid-1',
  parentUuid: null,
  type: 'assistant',
  timestamp: '2026-04-07T00:00:00Z',
  isSidechain: false,
  ...overrides,
});

describe('aggregateUsage', () => {
  it('sums tokens across multiple messages', () => {
    const messages: readonly TrailMessage[] = [
      makeMessage({
        uuid: 'msg-1',
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 10,
          cacheCreationTokens: 5,
        },
      }),
      makeMessage({
        uuid: 'msg-2',
        usage: {
          inputTokens: 200,
          outputTokens: 80,
          cacheReadTokens: 20,
          cacheCreationTokens: 15,
        },
      }),
    ];

    const result = aggregateUsage(messages);
    expect(result).toEqual({
      inputTokens: 300,
      outputTokens: 130,
      cacheReadTokens: 30,
      cacheCreationTokens: 20,
    });
  });

  it('skips messages without usage', () => {
    const messages: readonly TrailMessage[] = [
      makeMessage({
        uuid: 'msg-1',
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 10,
          cacheCreationTokens: 5,
        },
      }),
      makeMessage({ uuid: 'msg-2' }),
      makeMessage({ uuid: 'msg-3', type: 'user' }),
    ];

    const result = aggregateUsage(messages);
    expect(result).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 10,
      cacheCreationTokens: 5,
    });
  });

  it('returns all zeros for empty array', () => {
    const result = aggregateUsage([]);
    expect(result).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
  });
});
