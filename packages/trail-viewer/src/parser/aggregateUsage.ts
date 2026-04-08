import type { TrailMessage, TrailTokenUsage } from './types';

/**
 * Aggregate token usage across all messages.
 * Messages without usage are skipped.
 * Empty array returns all zeros.
 */
export function aggregateUsage(
  messages: readonly TrailMessage[],
): TrailTokenUsage {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;

  for (const msg of messages) {
    if (!msg.usage) {
      continue;
    }
    inputTokens += msg.usage.inputTokens;
    outputTokens += msg.usage.outputTokens;
    cacheReadTokens += msg.usage.cacheReadTokens;
    cacheCreationTokens += msg.usage.cacheCreationTokens;
  }

  return { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens };
}
