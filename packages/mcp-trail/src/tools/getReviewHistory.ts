import { z } from 'zod';
import { workspacePathParam } from './workspaceParam';
import { getReviewHistory, openCaravanBookDb, noopLogger } from '@anytime-markdown/trail-caravan-book/query';
import type { ReviewHistoryEntry } from '@anytime-markdown/trail-caravan-book/query';
import { resolveCaravanDbPath } from '../dbPath';

export const GetReviewHistoryInputSchema = z.object({
  workspacePath: workspacePathParam,
  target_file_path: z.string().optional().describe('Filter by file path'),
  package: z.string().optional().describe('Filter by package name'),
  category: z.string().optional().describe('Filter by finding category'),
  include_precedes_bugs: z.boolean().optional().describe('Include bug entity IDs linked via precedes edges'),
  limit: z.number().optional().describe('Max reviews to return (default 20)'),
});

export type GetReviewHistoryInput = z.infer<typeof GetReviewHistoryInputSchema>;

export async function handleGetReviewHistory(input: GetReviewHistoryInput): Promise<ReviewHistoryEntry[]> {
  const memHandle = await openCaravanBookDb(resolveCaravanDbPath({ workspacePath: input.workspacePath }));
  const logger = { info: noopLogger.info, error: console.error };
  try {
    return getReviewHistory({ db: memHandle.db, ...input, logger });
  } finally {
    memHandle.close();
  }
}
