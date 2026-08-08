import { z } from 'zod';
import { workspacePathParam } from './workspaceParam';
import { listRecurringBugs, openCaravanBookDb, noopLogger } from '@anytime-markdown/trail-caravan-book/query';
import type { RecurringBugGroup } from '@anytime-markdown/trail-caravan-book/query';
import { resolveCaravanDbPath } from '../dbPath';

export const ListRecurringBugsInputSchema = z.object({
  workspacePath: workspacePathParam,
  package: z.string().optional().describe('Filter by package name'),
  file_path: z.string().optional().describe('Filter by file path'),
  caused_by_entity_id: z.string().optional().describe('Filter by root cause entity ID'),
  windowDays: z.number().optional().describe('Time window in days (default 90)'),
  minCount: z.number().optional().describe('Minimum occurrence count (default 2)'),
});

export type ListRecurringBugsInput = z.infer<typeof ListRecurringBugsInputSchema>;

export async function handleListRecurringBugs(input: ListRecurringBugsInput): Promise<RecurringBugGroup[]> {
  const memHandle = await openCaravanBookDb(resolveCaravanDbPath({ workspacePath: input.workspacePath }));
  const logger = { info: noopLogger.info, error: console.error };
  try {
    return listRecurringBugs({ db: memHandle.db, ...input, logger });
  } finally {
    memHandle.close();
  }
}
