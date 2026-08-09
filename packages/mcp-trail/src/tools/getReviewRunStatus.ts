import { z } from 'zod';
import { workspacePathParam } from './workspaceParam';
import { getReviewRunStatus, openCaravanBookDb, noopLogger } from '@anytime-markdown/trail-caravan-book/query';
import type { ReviewRunStatus } from '@anytime-markdown/trail-caravan-book/query';
import { resolveCaravanDbPath } from '../dbPath';

export const GetReviewRunStatusInputSchema = z.object({
  workspacePath: workspacePathParam,
  run_id: z.string().describe('Review run ID returned by run_review_agent'),
});

export type GetReviewRunStatusInput = z.infer<typeof GetReviewRunStatusInputSchema>;

export async function handleGetReviewRunStatus(input: GetReviewRunStatusInput): Promise<ReviewRunStatus | null> {
  const memHandle = await openCaravanBookDb(resolveCaravanDbPath({ workspacePath: input.workspacePath }));
  const logger = { info: noopLogger.info, error: console.error };
  try {
    return getReviewRunStatus({ db: memHandle.db, ...input, logger });
  } finally {
    memHandle.close();
  }
}
