import { z } from 'zod';
import { getBugHistory, openMemoryCoreDb, noopLogger } from '@anytime-markdown/memory-core/query';
import type { BugHistoryEntry } from '@anytime-markdown/memory-core/query';

export const GetBugHistoryInputSchema = z.object({
  package: z.string().optional().describe('Filter by package name'),
  file_path: z.string().optional().describe('Filter by file path'),
  category: z.string().optional().describe('Filter by bug category'),
  limit: z.number().optional().describe('Max results (default 20)'),
});

export type GetBugHistoryInput = z.infer<typeof GetBugHistoryInputSchema>;

export async function handleGetBugHistory(input: GetBugHistoryInput): Promise<BugHistoryEntry[]> {
  const memHandle = await openMemoryCoreDb();
  const logger = { info: noopLogger.info, error: console.error };
  try {
    return getBugHistory({ db: memHandle.db, ...input, logger });
  } finally {
    memHandle.close();
  }
}
