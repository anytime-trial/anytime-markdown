import {
  ingestAgentReviewResult,
  type IngestAgentReviewResult,
  type CaravanDbConnection,
  type CaravanLogger,
} from '@anytime-markdown/trail-caravan-book';
import type { OllamaClient } from '@anytime-markdown/agent-core';

export async function submitToCaravanBook(input: {
  db: CaravanDbConnection;
  input: unknown;
  ollama: OllamaClient;
  logger: CaravanLogger;
}): Promise<IngestAgentReviewResult> {
  return await ingestAgentReviewResult(input);
}
