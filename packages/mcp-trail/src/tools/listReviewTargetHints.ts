import { z } from 'zod';
import { listReviewTargetHints, openMemoryCoreDb } from '@anytime-markdown/memory-core';
import type { ReviewTargetHint } from '@anytime-markdown/memory-core';

export const ListReviewTargetHintsInputSchema = z.object({
  limit: z.number().optional().describe('Max results (default 20)'),
});

export type ListReviewTargetHintsInput = z.infer<typeof ListReviewTargetHintsInputSchema>;

export async function handleListReviewTargetHints(input: ListReviewTargetHintsInput): Promise<ReviewTargetHint[]> {
  const memoryDbPath = process.env['MEMORY_CORE_DB_PATH'];
  const memHandle = await openMemoryCoreDb(memoryDbPath);
  const logger = { info: () => {}, error: console.error };
  try {
    return listReviewTargetHints({ db: memHandle.db, ...input, logger });
  } finally {
    memHandle.close();
  }
}
