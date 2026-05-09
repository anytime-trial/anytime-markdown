import { z } from 'zod';
import { getReviewRunStatus, openMemoryCoreDb } from '@anytime-markdown/memory-core';
import type { ReviewRunStatus } from '@anytime-markdown/memory-core';

export const GetReviewRunStatusInputSchema = z.object({
  run_id: z.string().describe('Review run ID returned by run_review_agent'),
});

export type GetReviewRunStatusInput = z.infer<typeof GetReviewRunStatusInputSchema>;

export async function handleGetReviewRunStatus(input: GetReviewRunStatusInput): Promise<ReviewRunStatus | null> {
  const memoryDbPath = process.env['MEMORY_CORE_DB_PATH'];
  const memHandle = await openMemoryCoreDb(memoryDbPath);
  const logger = { info: () => {}, error: console.error };
  try {
    return getReviewRunStatus({ db: memHandle.db, ...input, logger });
  } finally {
    memHandle.close();
  }
}
