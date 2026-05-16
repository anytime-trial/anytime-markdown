import {
  ingestAgentReviewResult,
  type IngestAgentReviewResult,
  type MemoryDbConnection,
  type MemoryLogger,
} from '@anytime-markdown/memory-core';
import type { OllamaClient } from '@anytime-markdown/agent-core';

export async function submitToMemoryCore(input: {
  db: MemoryDbConnection;
  input: unknown;
  ollama: OllamaClient;
  logger: MemoryLogger;
}): Promise<IngestAgentReviewResult> {
  return await ingestAgentReviewResult(input);
}
