import { z } from 'zod';
import { listReviewTargetHints, openMemoryCoreDb, noopLogger } from '@anytime-markdown/memory-core';
import type { ReviewTargetHint } from '@anytime-markdown/memory-core';

export const ListReviewTargetHintsInputSchema = z.object({
  limit: z.number().optional().describe('Max results (default 20)'),
});

export type ListReviewTargetHintsInput = z.infer<typeof ListReviewTargetHintsInputSchema>;

export async function handleListReviewTargetHints(input: ListReviewTargetHintsInput): Promise<ReviewTargetHint[]> {
  const memHandle = await openMemoryCoreDb();
  const logger = { info: noopLogger.info, error: console.error };
  try {
    return listReviewTargetHints({ db: memHandle.db, ...input, logger });
  } finally {
    memHandle.close();
  }
}
