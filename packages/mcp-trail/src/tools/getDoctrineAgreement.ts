import { z } from 'zod';
import { workspacePathParam } from './workspaceParam';
import { resolveMemoryDbPathForWrite, resolveWorkspacePath } from '../dbPath';
import { openMemoryDb } from '../sqlite/openDb';
import {
  ensureAndMigrateDoctrineJudgments,
  getDoctrineAgreementDirect,
  type DoctrineAgreementMetrics,
} from '../sqlite/doctrineJudgments';

export const GetDoctrineAgreementInputSchema = z.object({
  since: z.string().optional().describe('ISO 8601 lower bound on judged_at (inclusive)'),
  until: z.string().optional().describe('ISO 8601 upper bound on judged_at (inclusive)'),
  workspacePath: workspacePathParam,
});

export type GetDoctrineAgreementInput = z.infer<typeof GetDoctrineAgreementInputSchema>;

export async function handleGetDoctrineAgreement(
  input: GetDoctrineAgreementInput,
): Promise<DoctrineAgreementMetrics> {
  // 既存 MCP ルート (buildRouteOpts) と同じ入口: 引数 > TRAIL_WORKSPACE_PATH > cwd
  const workspacePath = resolveWorkspacePath(input.workspacePath).path;
  // 保存先は memory-core.db（2026-08-07 移設）。ensure + 遅延移行を含むため readwrite で開く
  const dbPath = resolveMemoryDbPathForWrite({ workspacePath });
  const opened = await openMemoryDb(dbPath, 'readwrite');
  try {
    ensureAndMigrateDoctrineJudgments(opened.db, dbPath);
    return getDoctrineAgreementDirect(opened.db, {
      ...(input.since === undefined ? {} : { since: input.since }),
      ...(input.until === undefined ? {} : { until: input.until }),
    });
  } finally {
    opened.close();
  }
}
