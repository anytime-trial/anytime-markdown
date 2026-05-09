import { z } from 'zod';
import { listUnaddressedReviewFindings, openMemoryCoreDb } from '@anytime-markdown/memory-core';
import type { UnaddressedReviewFinding } from '@anytime-markdown/memory-core';

export const ListUnaddressedReviewFindingsInputSchema = z.object({
  severity: z.string().optional().describe('Filter by severity (info, warn, error)'),
  daysSinceMin: z.number().optional().describe('Only findings recorded at least N days ago'),
  target_file_path: z.string().optional().describe('Filter by file path'),
  category: z.string().optional().describe('Filter by category'),
  limit: z.number().optional().describe('Max results (default 50)'),
});

export type ListUnaddressedReviewFindingsInput = z.infer<typeof ListUnaddressedReviewFindingsInputSchema>;

export async function handleListUnaddressedReviewFindings(
  input: ListUnaddressedReviewFindingsInput,
): Promise<UnaddressedReviewFinding[]> {
  const memoryDbPath = process.env['MEMORY_CORE_DB_PATH'];
  const memHandle = await openMemoryCoreDb(memoryDbPath);
  const logger = { info: () => {}, error: console.error };
  try {
    return listUnaddressedReviewFindings({ db: memHandle.db, ...input, logger });
  } finally {
    memHandle.close();
  }
}
