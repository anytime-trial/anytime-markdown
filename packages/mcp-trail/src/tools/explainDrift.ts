import { z } from 'zod';
import { explainDrift, openMemoryCoreDb } from '@anytime-markdown/memory-core';
import type { ExplainDriftResult } from '@anytime-markdown/memory-core';

export const ExplainDriftInputSchema = z.object({
  event_id: z.string().describe('Drift event ID to explain'),
});

export type ExplainDriftInput = z.infer<typeof ExplainDriftInputSchema>;

export async function handleExplainDrift(input: ExplainDriftInput): Promise<ExplainDriftResult | null> {
  const memoryDbPath = process.env['MEMORY_CORE_DB_PATH'];
  const memHandle = await openMemoryCoreDb(memoryDbPath);
  const logger = { info: () => {}, error: console.error };
  try {
    return explainDrift({ db: memHandle.db, ...input, logger });
  } finally {
    memHandle.close();
  }
}
