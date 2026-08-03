import { z } from 'zod';
import { workspacePathParam } from './workspaceParam';
import { resolveDrift, openMemoryCoreDb, noopLogger } from '@anytime-markdown/memory-core/query';
import type { ResolveDriftResult } from '@anytime-markdown/memory-core/query';
import { resolveMemoryDbPath } from '../dbPath';

export const ResolveDriftInputSchema = z.object({
  workspacePath: workspacePathParam,
  event_id: z.string().describe('Drift event ID to resolve'),
  resolution_note: z.string().describe('Note explaining the resolution'),
  resolved_at: z.string().optional().describe('ISO 8601 timestamp (defaults to now)'),
});

export type ResolveDriftInput = z.infer<typeof ResolveDriftInputSchema>;

export async function handleResolveDrift(input: ResolveDriftInput): Promise<ResolveDriftResult> {
  const memHandle = await openMemoryCoreDb(resolveMemoryDbPath({ workspacePath: input.workspacePath }));
  const logger = { info: noopLogger.info, error: console.error };
  try {
    return resolveDrift({ db: memHandle.db, ...input, logger });
  } finally {
    memHandle.close();
  }
}
