import type { TrailMessage, TrailFilter } from './types';

/**
 * Filter messages by toolName and/or searchText.
 * - toolName: case-insensitive substring match on toolCalls[].name
 * - searchText: case-insensitive match on textContent, userContent, or toolCalls[].name
 * - Both set → AND logic
 * - Neither set → return all
 */
export function filterMessages(
  messages: readonly TrailMessage[],
  filter: TrailFilter,
): readonly TrailMessage[] {
  const { toolName, searchText } = filter;

  if (!toolName && !searchText) {
    return messages;
  }

  const toolNameLower = toolName?.toLowerCase();
  const searchTextLower = searchText?.toLowerCase();

  return messages.filter((msg) => {
    const matchesTool = toolNameLower
      ? matchesToolName(msg, toolNameLower)
      : true;

    const matchesSearch = searchTextLower
      ? matchesSearchText(msg, searchTextLower)
      : true;

    return matchesTool && matchesSearch;
  });
}

function matchesToolName(
  msg: TrailMessage,
  toolNameLower: string,
): boolean {
  if (!msg.toolCalls) {
    return false;
  }
  return msg.toolCalls.some((tc) =>
    tc.name.toLowerCase().includes(toolNameLower),
  );
}

function matchesSearchText(
  msg: TrailMessage,
  searchTextLower: string,
): boolean {
  if (msg.textContent?.toLowerCase().includes(searchTextLower)) {
    return true;
  }
  if (msg.userContent?.toLowerCase().includes(searchTextLower)) {
    return true;
  }
  if (msg.toolCalls?.some((tc) =>
    tc.name.toLowerCase().includes(searchTextLower),
  )) {
    return true;
  }
  return false;
}
