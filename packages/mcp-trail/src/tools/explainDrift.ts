import { z } from 'zod';
import { workspacePathParam } from './workspaceParam';
import { explainDrift, openCaravanBookDb, noopLogger } from '@anytime-markdown/trail-caravan-book/query';
import type { ExplainDriftResult } from '@anytime-markdown/trail-caravan-book/query';
import { resolveCaravanDbPath } from '../dbPath';

export const ExplainDriftInputSchema = z.object({
  workspacePath: workspacePathParam,
  event_id: z.string().describe('Drift event ID to explain'),
});

export type ExplainDriftInput = z.infer<typeof ExplainDriftInputSchema>;

export async function handleExplainDrift(input: ExplainDriftInput): Promise<ExplainDriftResult | null> {
  const memHandle = await openCaravanBookDb(resolveCaravanDbPath({ workspacePath: input.workspacePath }));
  const logger = { info: noopLogger.info, error: console.error };
  try {
    return explainDrift({ db: memHandle.db, ...input, logger });
  } finally {
    memHandle.close();
  }
}
