import { z } from 'zod';
import { explainDrift, openMemoryCoreDb, noopLogger } from '@anytime-markdown/memory-core/query';
import type { ExplainDriftResult } from '@anytime-markdown/memory-core/query';

export const ExplainDriftInputSchema = z.object({
  event_id: z.string().describe('Drift event ID to explain'),
});

export type ExplainDriftInput = z.infer<typeof ExplainDriftInputSchema>;

export async function handleExplainDrift(input: ExplainDriftInput): Promise<ExplainDriftResult | null> {
  const memHandle = await openMemoryCoreDb();
  const logger = { info: noopLogger.info, error: console.error };
  try {
    return explainDrift({ db: memHandle.db, ...input, logger });
  } finally {
    memHandle.close();
  }
}
