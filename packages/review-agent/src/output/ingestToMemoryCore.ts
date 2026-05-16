import {
  ingestAgentReviewResult,
  type IngestAgentReviewResult,
  type MemoryDbConnection,
  type OllamaClient,
  type MemoryLogger,
} from '@anytime-markdown/memory-core';

export async function submitToMemoryCore(input: {
  db: MemoryDbConnection;
  input: unknown;
  ollama: OllamaClient;
  logger: MemoryLogger;
}): Promise<IngestAgentReviewResult> {
  return await ingestAgentReviewResult(input);
}
