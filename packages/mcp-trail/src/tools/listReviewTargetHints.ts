import { z } from 'zod';
import { workspacePathParam } from './workspaceParam';
import { listReviewTargetHints, openMemoryCoreDb, noopLogger } from '@anytime-markdown/trail-caravan-book/query';
import type { ReviewTargetHint } from '@anytime-markdown/trail-caravan-book/query';
import { resolveMemoryDbPath } from '../dbPath';

export const ListReviewTargetHintsInputSchema = z.object({
  workspacePath: workspacePathParam,
  limit: z.number().optional().describe('Max results (default 20)'),
});

export type ListReviewTargetHintsInput = z.infer<typeof ListReviewTargetHintsInputSchema>;

export async function handleListReviewTargetHints(input: ListReviewTargetHintsInput): Promise<ReviewTargetHint[]> {
  const memHandle = await openMemoryCoreDb(resolveMemoryDbPath({ workspacePath: input.workspacePath }));
  const logger = { info: noopLogger.info, error: console.error };
  try {
    return listReviewTargetHints({ db: memHandle.db, ...input, logger });
  } finally {
    memHandle.close();
  }
}
