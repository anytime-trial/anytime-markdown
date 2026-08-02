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
  // 既存 MCP ルート (buildRouteOpts) と同じ入口: 引数 > TRAIL_WORKSPACE_PATH > cwd
  const workspacePath = input.workspacePath ?? process.env['TRAIL_WORKSPACE_PATH'];
  const dbPath = resolveDbPath(workspacePath === undefined ? {} : { workspacePath });
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
