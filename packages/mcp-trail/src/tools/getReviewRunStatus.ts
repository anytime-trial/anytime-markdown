import { z } from 'zod';
import { workspacePathParam } from './workspaceParam';
import { getReviewRunStatus, openMemoryCoreDb, noopLogger } from '@anytime-markdown/memory-core/query';
import type { ReviewRunStatus } from '@anytime-markdown/memory-core/query';
import { resolveMemoryDbPath } from '../dbPath';

export const GetReviewRunStatusInputSchema = z.object({
  workspacePath: workspacePathParam,
  run_id: z.string().describe('Review run ID returned by run_review_agent'),
});

export type GetReviewRunStatusInput = z.infer<typeof GetReviewRunStatusInputSchema>;

export async function handleGetReviewRunStatus(input: GetReviewRunStatusInput): Promise<ReviewRunStatus | null> {
  const memHandle = await openMemoryCoreDb(resolveMemoryDbPath({ workspacePath: input.workspacePath }));
  const logger = { info: noopLogger.info, error: console.error };
  try {
    return getReviewRunStatus({ db: memHandle.db, ...input, logger });
  } finally {
    memHandle.close();
  }
}
