import { z } from 'zod';
import { getReviewHistory, openMemoryCoreDb } from '@anytime-markdown/memory-core';
import type { ReviewHistoryEntry } from '@anytime-markdown/memory-core';

export const GetReviewHistoryInputSchema = z.object({
  target_file_path: z.string().optional().describe('Filter by file path'),
  package: z.string().optional().describe('Filter by package name'),
  category: z.string().optional().describe('Filter by finding category'),
  include_precedes_bugs: z.boolean().optional().describe('Include bug entity IDs linked via precedes edges'),
  limit: z.number().optional().describe('Max reviews to return (default 20)'),
});

export type GetReviewHistoryInput = z.infer<typeof GetReviewHistoryInputSchema>;

export async function handleGetReviewHistory(input: GetReviewHistoryInput): Promise<ReviewHistoryEntry[]> {
  const memoryDbPath = process.env['MEMORY_CORE_DB_PATH'];
  const memHandle = await openMemoryCoreDb(memoryDbPath);
  const logger = { info: () => {}, error: console.error };
  try {
    return getReviewHistory({ db: memHandle.db, ...input, logger });
  } finally {
    memHandle.close();
  }
}
