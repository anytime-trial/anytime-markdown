import type { TrailMessage, TrailFilter } from '../types';
import { filterMessages } from '../filterMessages';

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

describe('filterMessages', () => {
  const msgWithTool = makeMessage({
    uuid: 'msg-tool',
    toolCalls: [
      { id: 'tc-1', name: 'Read', input: { file: 'a.ts' } },
    ],
  });

  const msgWithGrep = makeMessage({
    uuid: 'msg-grep',
    toolCalls: [
      { id: 'tc-2', name: 'Grep', input: { pattern: 'foo' } },
    ],
  });

  const msgWithText = makeMessage({
    uuid: 'msg-text',
    textContent: 'Refactored the parser module',
  });

  const msgWithUserContent = makeMessage({
    uuid: 'msg-user',
    type: 'user',
    userContent: 'Please fix the bug in editor',
  });

  const msgPlain = makeMessage({
    uuid: 'msg-plain',
  });

  const allMessages: readonly TrailMessage[] = [
    msgWithTool,
    msgWithGrep,
    msgWithText,
    msgWithUserContent,
    msgPlain,
  ];

  it('filters by toolName — match (case-insensitive substring)', () => {
    const filter: TrailFilter = { toolName: 'read' };
    const result = filterMessages(allMessages, filter);
    expect(result).toEqual([msgWithTool]);
  });

  it('filters by toolName — no match', () => {
    const filter: TrailFilter = { toolName: 'Write' };
    const result = filterMessages(allMessages, filter);
    expect(result).toEqual([]);
  });

  it('filters by searchText in textContent', () => {
    const filter: TrailFilter = { searchText: 'parser' };
    const result = filterMessages(allMessages, filter);
    expect(result).toEqual([msgWithText]);
  });

  it('filters by searchText in userContent', () => {
    const filter: TrailFilter = { searchText: 'bug' };
    const result = filterMessages(allMessages, filter);
    expect(result).toEqual([msgWithUserContent]);
  });

  it('filters by searchText in toolCalls name', () => {
    const filter: TrailFilter = { searchText: 'grep' };
    const result = filterMessages(allMessages, filter);
    expect(result).toEqual([msgWithGrep]);
  });

  it('combines toolName + searchText with AND logic', () => {
    const msgBoth = makeMessage({
      uuid: 'msg-both',
      textContent: 'reading file contents',
      toolCalls: [
        { id: 'tc-3', name: 'Read', input: { file: 'b.ts' } },
      ],
    });
    const messages = [...allMessages, msgBoth];

    const filter: TrailFilter = { toolName: 'read', searchText: 'reading' };
    const result = filterMessages(messages, filter);
    expect(result).toEqual([msgBoth]);
  });

  it('returns all messages when no filter is set', () => {
    const filter: TrailFilter = {};
    const result = filterMessages(allMessages, filter);
    expect(result).toEqual(allMessages);
  });

  it('returns empty array for empty messages', () => {
    const filter: TrailFilter = { toolName: 'Read' };
    const result = filterMessages([], filter);
    expect(result).toEqual([]);
  });
});
