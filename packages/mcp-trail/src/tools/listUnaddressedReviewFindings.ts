import { z } from 'zod';
import { workspacePathParam } from './workspaceParam';
import { listUnaddressedReviewFindings, openCaravanBookDb, noopLogger } from '@anytime-markdown/trail-caravan-book/query';
import type { UnaddressedReviewFinding } from '@anytime-markdown/trail-caravan-book/query';
import { resolveCaravanDbPath } from '../dbPath';

export const ListUnaddressedReviewFindingsInputSchema = z.object({
  workspacePath: workspacePathParam,
  severity: z.string().optional().describe('Filter by severity (info, warn, error)'),
  daysSinceMin: z.number().optional().describe('Only findings recorded at least N days ago'),
  target_file_path: z.string().optional().describe('Filter by file path'),
  category: z.string().optional().describe('Filter by category'),
  checklist_ref: z.string().optional().describe("Filter by checklist ref ('§14' etc., or 'none' = チェックリスト該当章なし)"),
  limit: z.number().optional().describe('Max results (default 50)'),
});

export type ListUnaddressedReviewFindingsInput = z.infer<typeof ListUnaddressedReviewFindingsInputSchema>;

export async function handleListUnaddressedReviewFindings(
  input: ListUnaddressedReviewFindingsInput,
): Promise<UnaddressedReviewFinding[]> {
  const memHandle = await openCaravanBookDb(resolveCaravanDbPath({ workspacePath: input.workspacePath }));
  const logger = { info: noopLogger.info, error: console.error };
  try {
    return listUnaddressedReviewFindings({ db: memHandle.db, ...input, logger });
  } finally {
    memHandle.close();
  }
}
