import { z } from 'zod';
import { linkReviewToCommit, openMemoryCoreDb, noopLogger } from '@anytime-markdown/memory-core';
import type { LinkReviewToCommitResult } from '@anytime-markdown/memory-core';

export const LinkReviewToCommitInputSchema = z.object({
  finding_id: z.string().describe('Review finding ID to mark as addressed'),
  commit_sha: z.string().describe('Commit SHA that addresses the finding'),
  addressed_at: z.string().optional().describe('ISO 8601 timestamp (defaults to now)'),
  override_auto: z.boolean().optional().describe('Override an existing mapping (default false)'),
});

export type LinkReviewToCommitInput = z.infer<typeof LinkReviewToCommitInputSchema>;

export async function handleLinkReviewToCommit(input: LinkReviewToCommitInput): Promise<LinkReviewToCommitResult> {
  const memHandle = await openMemoryCoreDb();
  const logger = { info: noopLogger.info, error: console.error };
  try {
    return linkReviewToCommit({ db: memHandle.db, ...input, logger });
  } finally {
    memHandle.close();
  }
}
