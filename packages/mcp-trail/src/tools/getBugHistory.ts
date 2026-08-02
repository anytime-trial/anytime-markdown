import { z } from 'zod';
import { workspacePathParam } from './workspaceParam';
import { getBugHistory, openMemoryCoreDb, noopLogger } from '@anytime-markdown/memory-core/query';
import type { BugHistoryEntry } from '@anytime-markdown/memory-core/query';
import { resolveMemoryDbPath } from '../dbPath';

export const GetBugHistoryInputSchema = z.object({
  workspacePath: workspacePathParam,
  package: z.string().optional().describe('Filter by package name'),
  file_path: z.string().optional().describe('Filter by file path'),
  category: z.string().optional().describe('Filter by bug category'),
  limit: z.number().optional().describe('Max results (default 20)'),
});

export type GetBugHistoryInput = z.infer<typeof GetBugHistoryInputSchema>;

export async function handleGetBugHistory(input: GetBugHistoryInput): Promise<BugHistoryEntry[]> {
  const memHandle = await openMemoryCoreDb(resolveMemoryDbPath({ workspacePath: input.workspacePath }));
  const logger = { info: noopLogger.info, error: console.error };
  try {
    return getBugHistory({ db: memHandle.db, ...input, logger });
  } finally {
    memHandle.close();
  }
}
