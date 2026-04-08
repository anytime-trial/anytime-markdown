import type { TrailMessage, TrailTreeNode } from '../types';
import { buildMessageTree } from '../buildMessageTree';

function makeMessage(
  overrides: Partial<TrailMessage> & { uuid: string; timestamp: string },
): TrailMessage {
  return {
    parentUuid: null,
    type: 'assistant',
    isSidechain: false,
    ...overrides,
  };
}

describe('buildMessageTree', () => {
  it('should return empty array for empty input', () => {
    const result = buildMessageTree([]);
    expect(result).toEqual([]);
  });

  it('should treat messages with no parentUuid as root nodes', () => {
    const messages: readonly TrailMessage[] = [
      makeMessage({ uuid: 'a', timestamp: '2026-01-01T00:00:00Z' }),
      makeMessage({ uuid: 'b', timestamp: '2026-01-01T00:01:00Z' }),
    ];

    const result = buildMessageTree(messages);

    expect(result).toHaveLength(2);
    expect(result[0].message.uuid).toBe('a');
    expect(result[1].message.uuid).toBe('b');
    expect(result[0].depth).toBe(0);
    expect(result[1].depth).toBe(0);
    expect(result[0].children).toEqual([]);
    expect(result[1].children).toEqual([]);
  });

  it('should build tree from flat messages using parentUuid', () => {
    const messages: readonly TrailMessage[] = [
      makeMessage({ uuid: 'root', timestamp: '2026-01-01T00:00:00Z', type: 'user' }),
      makeMessage({
        uuid: 'child1',
        parentUuid: 'root',
        timestamp: '2026-01-01T00:01:00Z',
      }),
      makeMessage({
        uuid: 'child2',
        parentUuid: 'root',
        timestamp: '2026-01-01T00:02:00Z',
        type: 'user',
      }),
    ];

    const result = buildMessageTree(messages);

    expect(result).toHaveLength(1);
    expect(result[0].message.uuid).toBe('root');
    expect(result[0].children).toHaveLength(2);
    expect(result[0].children[0].message.uuid).toBe('child1');
    expect(result[0].children[1].message.uuid).toBe('child2');
  });

  it('should set correct depth for nested nodes', () => {
    const messages: readonly TrailMessage[] = [
      makeMessage({ uuid: 'a', timestamp: '2026-01-01T00:00:00Z' }),
      makeMessage({ uuid: 'b', parentUuid: 'a', timestamp: '2026-01-01T00:01:00Z' }),
      makeMessage({ uuid: 'c', parentUuid: 'b', timestamp: '2026-01-01T00:02:00Z' }),
    ];

    const result = buildMessageTree(messages);

    expect(result).toHaveLength(1);
    expect(result[0].depth).toBe(0);
    expect(result[0].children[0].depth).toBe(1);
    expect(result[0].children[0].children[0].depth).toBe(2);
  });

  it('should handle sidechain messages as children', () => {
    const messages: readonly TrailMessage[] = [
      makeMessage({ uuid: 'main', timestamp: '2026-01-01T00:00:00Z' }),
      makeMessage({
        uuid: 'side',
        parentUuid: 'main',
        timestamp: '2026-01-01T00:01:00Z',
        isSidechain: true,
      }),
    ];

    const result = buildMessageTree(messages);

    expect(result).toHaveLength(1);
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].message.uuid).toBe('side');
    expect(result[0].children[0].message.isSidechain).toBe(true);
    expect(result[0].children[0].depth).toBe(1);
  });

  it('should sort children by timestamp ascending', () => {
    const messages: readonly TrailMessage[] = [
      makeMessage({ uuid: 'root', timestamp: '2026-01-01T00:00:00Z' }),
      makeMessage({
        uuid: 'late',
        parentUuid: 'root',
        timestamp: '2026-01-01T00:03:00Z',
      }),
      makeMessage({
        uuid: 'early',
        parentUuid: 'root',
        timestamp: '2026-01-01T00:01:00Z',
      }),
      makeMessage({
        uuid: 'mid',
        parentUuid: 'root',
        timestamp: '2026-01-01T00:02:00Z',
      }),
    ];

    const result = buildMessageTree(messages);

    expect(result[0].children).toHaveLength(3);
    expect(result[0].children[0].message.uuid).toBe('early');
    expect(result[0].children[1].message.uuid).toBe('mid');
    expect(result[0].children[2].message.uuid).toBe('late');
  });

  it('should treat orphan messages as root nodes', () => {
    const messages: readonly TrailMessage[] = [
      makeMessage({ uuid: 'a', timestamp: '2026-01-01T00:00:00Z' }),
      makeMessage({
        uuid: 'orphan',
        parentUuid: 'nonexistent',
        timestamp: '2026-01-01T00:01:00Z',
      }),
    ];

    const result = buildMessageTree(messages);

    expect(result).toHaveLength(2);
    expect(result[0].message.uuid).toBe('a');
    expect(result[1].message.uuid).toBe('orphan');
    expect(result[0].depth).toBe(0);
    expect(result[1].depth).toBe(0);
  });

  it('should sort root nodes by timestamp ascending', () => {
    const messages: readonly TrailMessage[] = [
      makeMessage({ uuid: 'c', timestamp: '2026-01-01T00:03:00Z' }),
      makeMessage({ uuid: 'a', timestamp: '2026-01-01T00:01:00Z' }),
      makeMessage({ uuid: 'b', timestamp: '2026-01-01T00:02:00Z' }),
    ];

    const result = buildMessageTree(messages);

    expect(result[0].message.uuid).toBe('a');
    expect(result[1].message.uuid).toBe('b');
    expect(result[2].message.uuid).toBe('c');
  });
});
