import {
  ingestAgentReviewResult,
  type IngestAgentReviewResult,
  type OllamaClient,
  type MemoryLogger,
} from '@anytime-markdown/memory-core';
import type { Database } from 'sql.js';

export async function submitToMemoryCore(input: {
  db: Database;
  input: unknown;
  ollama: OllamaClient;
  logger: MemoryLogger;
}): Promise<IngestAgentReviewResult> {
  return await ingestAgentReviewResult(input);
}
