import { z } from 'zod';
import { resolveDbPath } from '../dbPath';
import { openTrailDb } from '../sqlite/openDb';
import {
  getDoctrineAgreementDirect,
  type DoctrineAgreementMetrics,
} from '../sqlite/doctrineJudgments';

export const GetDoctrineAgreementInputSchema = z.object({
  since: z.string().optional().describe('ISO 8601 lower bound on judged_at (inclusive)'),
  until: z.string().optional().describe('ISO 8601 upper bound on judged_at (inclusive)'),
  workspacePath: z.string().optional().describe('Workspace root to resolve trail.db (defaults to cwd)'),
});

export type GetDoctrineAgreementInput = z.infer<typeof GetDoctrineAgreementInputSchema>;

export async function handleGetDoctrineAgreement(
  input: GetDoctrineAgreementInput,
): Promise<DoctrineAgreementMetrics> {
  const dbPath = resolveDbPath({ workspacePath: input.workspacePath });
  // ensure (CREATE TABLE IF NOT EXISTS) を含むため readwrite で開く
  const opened = await openTrailDb(dbPath, 'readwrite');
  try {
    return getDoctrineAgreementDirect(opened.db, {
      ...(input.since === undefined ? {} : { since: input.since }),
      ...(input.until === undefined ? {} : { until: input.until }),
    });
  } finally {
    opened.close();
  }
}
