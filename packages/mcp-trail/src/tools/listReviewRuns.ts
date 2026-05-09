import { z } from 'zod';
import { listReviewRuns, openMemoryCoreDb } from '@anytime-markdown/memory-core';
import type { ReviewRunStatus } from '@anytime-markdown/memory-core';

export const ListReviewRunsInputSchema = z.object({
  trigger_kind: z.string().optional().describe('Filter by trigger kind'),
  status: z.string().optional().describe('Filter by status'),
  target_kind: z.string().optional().describe('Filter by target kind'),
  model: z.string().optional().describe('Filter by model'),
  since: z.string().optional().describe('Filter by started_at >= ISO 8601'),
  limit: z.number().optional().describe('Max results (default 20)'),
});

export type ListReviewRunsInput = z.infer<typeof ListReviewRunsInputSchema>;

export async function handleListReviewRuns(input: ListReviewRunsInput): Promise<ReviewRunStatus[]> {
  const memoryDbPath = process.env['MEMORY_CORE_DB_PATH'];
  const memHandle = await openMemoryCoreDb(memoryDbPath);
  const logger = { info: () => {}, error: console.error };
  try {
    return listReviewRuns({ db: memHandle.db, ...input, logger });
  } finally {
    memHandle.close();
  }
}
